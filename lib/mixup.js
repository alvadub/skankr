import midiWriter from "midi-writer-js";
import { reduce } from "./parser.js";
import { split, isPattern } from "./tokenize.js";
import { flatten } from "./utils.js";

const { Track, NoteEvent, ProgramChangeEvent, TempoEvent, TrackNameEvent, InstrumentNameEvent } = midiWriter;

const DEFAULT = Symbol("@main");
const DRUM_PROGRAM_TO_NOTE = {
  2001: 36,
  2004: 38,
  2028: 39,
  2035: 42,
  2081: 46,
  2123: 50,
};

function isDrumProgram(program) {
  return Number.isFinite(program) && program >= 2000;
}

function midiChannelForProgram(program, melodicIndex) {
  if (isDrumProgram(program)) return 10;
  const normalized = melodicIndex % 15;
  return normalized >= 9 ? normalized + 2 : normalized + 1;
}

function normalizeVelocity(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 64;
  if (raw <= 1) return Math.max(1, Math.round(raw * 100));
  return Math.max(1, Math.min(100, Math.round(raw)));
}

function normalizePitch(value, fallback) {
  if (Array.isArray(value)) return value;
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
}

function mergeNotePayload(a, b) {
  const aa = Array.isArray(a) ? a : (a ? [a] : []);
  const bb = Array.isArray(b) ? b : (b ? [b] : []);
  const out = [];

  aa.concat(bb).forEach((note) => {
    if (typeof note === "undefined" || note === null) return;
    if (!out.includes(note)) out.push(note);
  });

  if (out.length === 0) return undefined;
  if (out.length === 1) return out[0];
  return out;
}

function mergeTicks(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (Array.isArray(left) && Array.isArray(right)) {
      const max = Math.max(left.length, right.length);
      const out = [];

      for (let i = 0; i < max; i += 1) {
        out.push(mergeTicks(left[i], right[i]));
      }
      return out;
    }

    return typeof right !== "undefined" ? right : left;
  }

  if (!left) return right;
  if (!right) return left;

  const lv = left.v || 0;
  const rv = right.v || 0;
  const hitLeft = lv > 0;
  const hitRight = rv > 0;

  if (!hitLeft && hitRight) return { ...right };
  if (hitLeft && !hitRight) return { ...left };

  if (!hitLeft && !hitRight) {
    return (left.h || right.h) ? { v: 0, h: 1 } : { v: 0 };
  }

  const out = {
    ...left,
    ...right,
    v: Math.max(lv, rv),
  };
  const note = mergeNotePayload(left.n, right.n);
  if (typeof note !== "undefined") out.n = note;
  return out;
}

function mergeTickLayers(base, top) {
  const max = Math.max(base.length, top.length);
  const out = [];

  for (let i = 0; i < max; i += 1) {
    out.push(mergeTicks(base[i], top[i]));
  }
  return out;
}

function createWriterBuffer(tracks) {
  const writer = new midiWriter.Writer(tracks);
  return writer.buildFile();
}

export function renderTracks(midi, bpm = 120, length = 16) {
  const tracks = [];
  const rendered = [];
  const slotTicks = 32;
  let melodicChannelIndex = 0;

  function get(nth, name) {
    const key = nth + name;

    if (!get[key]) {
      const track = new Track();
      const program = parseInt(nth, 10) || 0;
      const chan = midiChannelForProgram(program, melodicChannelIndex);

      tracks.push(track);
      get[key] = {
        chan,
        key,
        name: String(name || nth),
        program,
        track,
      };
      rendered.push(get[key]);
      track.addEvent(new TrackNameEvent({ text: String(name || nth) }));
      track.addEvent(new TempoEvent({ bpm }));

      if (isDrumProgram(program)) {
        track.addEvent(new InstrumentNameEvent({ text: "Drums" }));
      } else {
        track.addEvent(new ProgramChangeEvent({
          channel: chan,
          instrument: program,
        }));
        track.addEvent(new InstrumentNameEvent({ text: `Program ${program}` }));
        melodicChannelIndex += 1;
      }
    }
    return get[key];
  }

  midi.forEach((section) => {
    section.forEach((parts) => {
      parts.forEach((e) => {
        const { chan, track, program } = get(e[0], e[1]);
        const drumFallback = DRUM_PROGRAM_TO_NOTE[program] || 36;
        const ticks = Array.isArray(e[2]) ? e[2] : [];

        for (let i = 0; i < ticks.length; i += 1) {
          const tick = ticks[i];
          if (!tick || typeof tick !== "object" || !(tick.v > 0)) continue;

          let sustain = 1;
          while (i + sustain < ticks.length) {
            const next = ticks[i + sustain];
            if (!next || typeof next !== "object" || !next.h) break;
            sustain += 1;
          }

          track.addEvent(new NoteEvent({
            channel: chan,
            pitch: normalizePitch(tick.n, drumFallback),
            tick: i * slotTicks,
            duration: `T${slotTicks * sustain}`,
            velocity: normalizeVelocity(tick.v),
          }));
        }
      });
    });
  });

  void length;
  return rendered;
}

export function build(midi, bpm = 120, length = 16) {
  const rendered = renderTracks(midi, bpm, length);
  return createWriterBuffer(rendered.map((item) => item.track));
}

export function buildSplit(midi, bpm = 120, length = 16) {
  return renderTracks(midi, bpm, length).map((item) => ({
    ...item,
    data: createWriterBuffer([item.track]),
  }));
}

export function pack(values, notes) {
  let offset;
  function cyclical(list, index) {
    if (!Array.isArray(list) || !list.length) return undefined;
    const pos = ((index % list.length) + list.length) % list.length;
    return list[pos];
  }

  function resolve(x) {
    if (Array.isArray(x)) {
      return x.map(resolve);
    }

    if (typeof x === "string" && x.length > 1 && /[x_\-\[\]]/.test(x)) {
      const parts = split(x);
      if (Array.isArray(parts) && parts.length > 1) {
        return parts.map(resolve);
      }
    }

    let token;
    if (!"-x_".includes(x)) {
      token = { v: 127, l: x };
      const velocity = cyclical(values, offset);
      token.v = typeof velocity !== "undefined" ? velocity : token.v || 0;
      const note = cyclical(notes, offset);
      if (typeof note !== "undefined") token.n = note;
      if (values.length === 1) token.v = values[0];
      if (token.v || token.n) offset += 1;
      return token;
    }

    if (x === "-") {
      return { v: 0 };
    }

    if (x === "_") {
      return { v: 0, h: 1 };
    }

    token = { v: 127 };
    const velocity = cyclical(values, offset);
    token.v = typeof velocity !== "undefined" ? velocity : token.v || 0;
    const note = cyclical(notes, offset);
    if (typeof note !== "undefined") token.n = note;
    if (values.length === 1) token.v = values[0];
    if (token.v || token.n) offset += 1;
    return token;
  }

  return (value) => {
    let result = value;
    if (typeof value === "string") {
      if (isPattern(value)) {
        offset = 0;
        result = split(value).map(resolve);
      }
    }
    return result;
  };
}

export function merge(ctx) {
  const scenes = {};

  Object.entries(ctx.tracks).forEach(([name, channels]) => {
    Object.entries(channels).forEach(([ch, clips]) => {
      const [tag, midi] = ch.split("#");
      const key = tag || DEFAULT;

      let ticks;
      clips.forEach((clip) => {
        const values = clip.values ? reduce(clip.values, ctx.data) : [];
        const notes = clip.data ? reduce(clip.data, ctx.data) : [];

        if (clip.input) {
          if (values.length > 1) values.shift();

          const input = flatten(reduce(clip.input, ctx.data, pack(values, notes)));
          const mode = clip.values
            && clip.values[0]
            && clip.values[0].type === "mode" ? clip.values[0].value : null;

          input.forEach((tick) => {
            if (tick.v > 0) {
              if (mode && values.length > 0) tick[mode[0].toLowerCase()] = values.shift();
            }
          });

          if (clip.merge === "layer" && ticks) {
            ticks = mergeTickLayers(ticks, input);
          } else {
            ticks = input;
          }
        } else if (ticks) {
          const mode = clip.values
            && clip.values[0]
            && clip.values[0].type === "mode" ? clip.values[0].value : null;

          ticks.forEach((tick) => {
            if (tick.v > 0) {
              if (mode && values.length > 0) tick[mode[0].toLowerCase()] = values.shift();
            }
          });
        }
      });

      if (!scenes[key]) scenes[key] = { tracks: [] };
      scenes[key].tracks.push([midi, name, ticks]);
    });
  });

  if (!ctx.main.length) {
    ctx.main = [[{ type: "value", value: DEFAULT }]];
  }

  return ctx.main.map((track) => {
    return reduce(track, scenes).map((item) => {
      return [].concat(item).reduce((memo, x) => {
        memo.push(...x.tracks);
        return memo;
      }, []);
    });
  });
}

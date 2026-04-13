/**
 * skt.js — Pure SKT (Skanker Token) encode/decode functions.
 *
 * Exports the URL share format pipeline: encodeHeader, decodeHeader,
 * encodeScene, decodeScene, collectIndexed, and their pure helpers.
 * No DOM, no audio, no side effects.
 */

export {
  // base64 helpers
  utf8ToBase64Url,
  base64UrlToUtf8,
  // header
  encodeHeader,
  decodeHeader,
  // scene
  encodeScene,
  decodeScene,
  // v1 migration
  decodeV1Payload,
  // bass helpers
  normalizeBassEvents,
  formatBassNotes,
  formatBassPattern,
  formatBassPatternSymbols,
  bassPatternToEvents,
  bassPatternStats,
  parseBassNotes,
  parseBassPattern,
  sortAndTrimBassEvents,
  // subdivision
  SUBDIVISIONS,
  DEFAULT_SUBDIVISIONS,
  subdivisionToBeats,
  isValidSubdivision,
  // misc
  collectIndexed,
  isDefaultSceneName,
  hasCustomTrackVolumes,
  // constants
  TRACKS,
  BASS_TICKS,
  BASS_TICKS_PER_STEP,
  SOUND_NAMES,
  DRUM_KIT_NAMES,
  BASS_PRESET_NAMES,
};

import {
  STEPS, CHORD_STEPS, DRUM_STEPS,
  clampNumber, fixedLengthArray,
  drumLengthArray, normalizeDrumValue,
  encodeChordRle, decodeChordRle,
  encodeDrumTrack, decodeDrumTrack,
} from "./codec.js";

function drumValuesToHits(values) {
  if (!Array.isArray(values)) return Array(DRUM_STEPS).fill(null);
  const isHitFormat = values.some((v) => Array.isArray(v));
  if (isHitFormat) {
    return fixedLengthArray(values, null, DRUM_STEPS);
  }
  return drumLengthArray(values).map((v) => {
    const vel = normalizeDrumValue(v);
    if (vel <= 0) return null;
    return [{ pos: 0, vel }];
  });
}

// --- Constants ---

const BASS_TICKS_PER_STEP = 4;
const BASS_TICKS = STEPS * BASS_TICKS_PER_STEP;

const TRACKS = [
  { key: "kick",    label: "Kick",    volume: 0.9  },
  { key: "snare",   label: "Snare",   volume: 0.75 },
  { key: "hihat",   label: "Hi-hat",  volume: 0.45 },
  { key: "openhat", label: "Open HH", volume: 0.55 },
];

const SOUND_NAMES = new Set([
  "internal", "sub", "organ", "synth", "brass", "flute", "clav",
  "pad", "string", "piano", "guitar", "strings",
]);

const DRUM_KIT_NAMES = new Set([
  "internal", "standard", "room", "brush", "power", "electronic", "tr808", "tr78", "cr8000", "jazz", "orchestra",
]);

const BASS_PRESET_NAMES = new Set(["sub", "dub", "rubber", "square", "custom"]);

const SUBDIVISIONS = {
  "1n":  4,
  "2n":  2,
  "4n":  1,
  "4t":  2/3,
  "8n":  0.5,
  "8t":  1/3,
  "16n": 0.25,
  "16t": 1/6,
  "32n": 0.125,
};

const DEFAULT_SUBDIVISIONS = {
  drums: "8n",
  rhythm: "4n",
  harmony: "4n",
  bass: "16n",
};

const NOTE_ROOTS = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

function isValidSubdivision(value) {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SUBDIVISIONS, value);
}

function subdivisionToBeats(subdiv) {
  return isValidSubdivision(subdiv) ? SUBDIVISIONS[subdiv] : 1;
}

// --- Base64 helpers ---

function utf8ToBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToUtf8(value) {
  const base64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "===".slice((base64.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// --- Note helpers ---

function canonicalRoot(rawRoot) {
  return `${rawRoot[0].toUpperCase()}${rawRoot.slice(1)}`;
}

function parseNoteName(rawNote) {
  const match = String(rawNote || "").trim().match(/^([A-Ga-g](?:#|b)?)(-?\d+)$/);
  if (!match) return null;
  const root = canonicalRoot(match[1]);
  if (!(root in NOTE_ROOTS)) return null;
  const octave = Number(match[2]);
  const midi = (octave + 1) * 12 + NOTE_ROOTS[root];
  return { label: `${root.toLowerCase()}${octave}`, midi };
}

function midiToLabel(midi) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`.toLowerCase();
}

// --- Bass helpers ---

function normalizeBassNote(value) {
  const midi = Number(value.midi);
  if (!Number.isFinite(midi)) return null;
  return { midi: Math.trunc(clampNumber(midi, 12, 96, 36)) };
}

function normalizeBassEvent(value, fallbackTick = 0) {
  const note = normalizeBassNote(value);
  if (!note) return null;
  const rawTick = Number.isFinite(Number(value.tick)) ? Number(value.tick) : fallbackTick;
  const rawLength = Number.isFinite(Number(value.length)) ? Number(value.length) : BASS_TICKS_PER_STEP;
  return {
    tick: Math.trunc(clampNumber(rawTick, 0, BASS_TICKS - 1, fallbackTick)),
    midi: note.midi,
    length: Math.trunc(clampNumber(rawLength, 1, BASS_TICKS, BASS_TICKS_PER_STEP)),
    velocity: clampNumber(value.velocity, 0, 1, 1),
    code: "",
  };
}

function sortAndTrimBassEvents(events) {
  events.sort((a, b) => a.tick - b.tick);
  events.forEach((event, index) => {
    const next = events[index + 1];
    const maxLength = next ? next.tick - event.tick : BASS_TICKS - event.tick;
    event.length = Math.max(1, Math.min(event.length, maxLength));
  });
  return events;
}

function normalizeBassEvents(value) {
  if (!Array.isArray(value)) return [];
  return sortAndTrimBassEvents(
    value
      .map((entry, index) => normalizeBassEvent(entry, index * BASS_TICKS_PER_STEP))
      .filter(Boolean)
  );
}

function formatBassNotes(events) {
  return normalizeBassEvents(events).map((e) => midiToLabel(e.midi)).join(" ");
}

function formatBassPatternSymbols(symbols) {
  const groups = [];
  for (let i = 0; i < symbols.length; i += BASS_TICKS_PER_STEP) {
    groups.push(symbols.slice(i, i + BASS_TICKS_PER_STEP).join(""));
  }
  return groups.join(" ");
}

function formatBassPattern(events) {
  const symbols = Array(BASS_TICKS).fill("-");
  normalizeBassEvents(events).forEach((e) => {
    symbols[e.tick] = "x";
    for (let i = 1; i < e.length && e.tick + i < BASS_TICKS; i++) {
      symbols[e.tick + i] = "_";
    }
  });
  return formatBassPatternSymbols(symbols);
}

function parseBassNotes(rawNotes) {
  const tokens = String(rawNotes || "").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const notes = tokens.map(parseNoteName);
  return notes.some((n) => !n) ? null : notes;
}

function splitPatternWithSubsteps(raw) {
  const out = [];
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "[") {
      const end = raw.indexOf("]", i + 1);
      if (end < 0) break;
      out.push(raw.slice(i + 1, end).split(""));
      i = end;
      continue;
    }
    out.push(ch);
  }
  return out;
}

function parseBassPattern(rawPattern, maxTicks = BASS_TICKS) {
  const raw = String(rawPattern || "").trim();
  if (!raw) return [];
  if (/[^xX_\-\[\]\s|.0]/.test(raw)) return null;
  const symbols = splitPatternWithSubsteps(raw.replace(/[\s|]/g, "").replace(/[.0]/g, "-"));
  const flat = symbols.flat(1);
  if (!flat.length || flat.length > maxTicks) return null;
  return symbols;
}

function bassPatternStats(pattern) {
  const flat = pattern.flat(1);
  const stats = { pulses: 0, sustains: 0, rests: 0, ticks: flat.length };
  let hasActiveNote = false;
  flat.forEach((symbol) => {
    if (symbol === "x" || symbol === "X" || (symbol === "_" && !hasActiveNote)) {
      stats.pulses += 1;
      hasActiveNote = true;
    } else if (symbol === "_") {
      stats.sustains += 1;
    } else {
      stats.rests += 1;
      hasActiveNote = false;
    }
  });
  return stats;
}

function bassPatternToEvents(rawNotes, rawPattern, tickOffset = 0, maxTicks = BASS_TICKS) {
  const notes = parseBassNotes(rawNotes);
  const pattern = parseBassPattern(rawPattern, maxTicks);
  if (!notes || !pattern) return null;
  const flat = pattern.flat(1);
  if (notes.length !== bassPatternStats(pattern).pulses) return null;
  const events = [];
  let noteIndex = 0;
  let currentEvent = null;
  flat.forEach((symbol, tick) => {
    if (symbol === "x" || symbol === "X" || (symbol === "_" && !currentEvent)) {
      const note = notes[noteIndex];
      if (!note) return;
      currentEvent = { tick: tickOffset + tick, midi: note.midi, length: 1, velocity: 1, code: "" };
      events.push(currentEvent);
      noteIndex += 1;
    } else if (symbol === "_" && currentEvent) {
      currentEvent.length += 1;
    } else {
      currentEvent = null;
    }
  });
  return sortAndTrimBassEvents(events);
}

// --- Scene normalization ---

function isDefaultSceneName(name) {
  return /^Scene \d+$/i.test(String(name || "").trim());
}

function hasCustomTrackVolumes(scene) {
  return TRACKS.some((track) => {
    const v = clampNumber(scene.trackVolumes?.[track.key], 0, 1, track.volume);
    return Math.round(v * 100) !== Math.round(track.volume * 100);
  });
}

function normalizeScene(rawScene, index) {
  const source = rawScene && typeof rawScene === "object" ? rawScene : {};
  const rhythm  = fixedLengthArray(source.rhythm,  "", CHORD_STEPS).map((v) => String(v || ""));
  const harmony = fixedLengthArray(source.harmony, "", CHORD_STEPS).map((v) => String(v || ""));
  const bass    = normalizeBassEvents(source.bass);
  const defaultName = `Scene ${index + 1}`;
  return {
    name: typeof source.name === "string" && source.name.trim() ? source.name.trim() : defaultName,
    rhythm,
    harmony,
    bass,
    drums: Object.fromEntries(TRACKS.map((track) => [
      track.key,
      drumValuesToHits(source.drums?.[track.key]),
    ])),
    mutes: {
      rhythm:  Boolean(source.mutes?.rhythm),
      harmony: Boolean(source.mutes?.harmony),
      bass:    Boolean(source.mutes?.bass),
      drums:   Object.fromEntries(TRACKS.map((t) => [t.key, Boolean(source.mutes?.drums?.[t.key])])),
    },
    trackVolumes: Object.fromEntries(TRACKS.map((t) => [
      t.key,
      clampNumber(source.trackVolumes?.[t.key], 0, 1, t.volume),
    ])),
  };
}

// --- Scene encode/decode ---

function encodeScene(scene, index = 0) {
  const s = normalizeScene(scene, index);
  const parts = [
    encodeChordRle(s.rhythm),
    encodeChordRle(s.harmony),
    TRACKS.map((t) => encodeDrumTrack(s.drums[t.key])).join(":"),
  ];
  if (s.bass.length) {
    const notes   = utf8ToBase64Url(formatBassNotes(s.bass));
    const pattern = formatBassPattern(s.bass).replace(/\s+/g, "");
    parts.push(`${notes}:${pattern}`);
  }
  let muteBits = 0;
  if (s.mutes.rhythm)  muteBits |= 1 << 0;
  if (s.mutes.harmony) muteBits |= 1 << 1;
  if (s.mutes.bass)    muteBits |= 1 << 2;
  TRACKS.forEach((t, i) => { if (s.mutes.drums[t.key]) muteBits |= 1 << (i + 3); });
  if (muteBits) parts.push(muteBits.toString(16));
  if (hasCustomTrackVolumes(s)) {
    parts.push(`v${TRACKS.map((t) => Math.round(clampNumber(s.trackVolumes[t.key], 0, 1, t.volume) * 100)).join("-")}`);
  }
  if (!isDefaultSceneName(s.name)) {
    parts.push(`n${utf8ToBase64Url(s.name.trim())}`);
  }
  return parts.join(".");
}

function decodeScene(token, index = 0) {
  const parts = String(token || "").split(".");
  const [rhythmRle = "-", harmonyRle = "-", drumsEnc = "(-)32:(-)32:(-)32:(-)32", ...extra] = parts;
  let bassEnc = "", mutesHex = "", volumeToken = "", nameToken = "";
  extra.forEach((part) => {
    if (!part) return;
    if (!bassEnc && part.includes(":"))    { bassEnc = part; return; }
    if (!volumeToken && part.startsWith("v")) { volumeToken = part.slice(1); return; }
    if (!nameToken && part.startsWith("n"))   { nameToken = part.slice(1); return; }
    if (!mutesHex && /^[0-9a-f]+$/i.test(part)) mutesHex = part;
  });
  const drumParts = drumsEnc.split(":");
  const bassParts = bassEnc ? bassEnc.split(":") : [];
  let bassNotes = "";
  if (bassParts[0]) {
    try { bassNotes = base64UrlToUtf8(bassParts[0]); } catch {}
  }
  const bassPattern = bassParts[1] || "";
  const bassEvents  = bassNotes && bassPattern ? (bassPatternToEvents(bassNotes, bassPattern) || []) : [];
  const muteValue   = parseInt(mutesHex || "0", 16) || 0;
  let sceneName;
  if (nameToken) {
    try { const d = base64UrlToUtf8(nameToken).trim(); if (d) sceneName = d; } catch {}
  }
  const trackVolumes = volumeToken
    ? Object.fromEntries(TRACKS.map((t, i) => [
        t.key,
        clampNumber(Number(volumeToken.split("-")[i]) / 100, 0, 1, t.volume),
      ]))
    : undefined;
  return normalizeScene({
    name: sceneName,
    rhythm:  decodeChordRle(rhythmRle),
    harmony: decodeChordRle(harmonyRle),
    bass:    bassEvents,
    drums:   Object.fromEntries(TRACKS.map((t, i) => [t.key, decodeDrumTrack(drumParts[i] || "(-)32")])),
    mutes: {
      rhythm:  Boolean(muteValue & (1 << 0)),
      harmony: Boolean(muteValue & (1 << 1)),
      bass:    Boolean(muteValue & (1 << 2)),
      drums:   Object.fromEntries(TRACKS.map((t, i) => [t.key, Boolean(muteValue & (1 << (i + 3)))])),
    },
    trackVolumes,
  }, index);
}

// --- Header encode/decode ---

function encodeHeader(state) {
  const tokens = [];
  const title = String(state.songTitle || "").trim();
  const meta  = [`t${state.bpm ?? 100}`];
  if (title && title !== "Untitled Project") meta.push(String(CHORD_STEPS), utf8ToBase64Url(title));
  else if (CHORD_STEPS !== 32) meta.push(String(CHORD_STEPS));
  tokens.push(meta.join("."));

  const subdiv = state.subdiv || DEFAULT_SUBDIVISIONS.drums;
  if (subdiv !== DEFAULT_SUBDIVISIONS.drums) {
    tokens.push(`s${subdiv}`);
  }

  const ds = TRACKS.map((t) => state.sounds?.drums?.[t.key] || "internal");
  const drumToken = ds.every((v) => v === ds[0]) ? ds[0] : ds.join("-");
  const rhythm    = state.sounds?.rhythm  || "organ";
  const harmony   = state.sounds?.harmony || "pad";
  const bassPreset = state.bass?.preset   || "sub";
  if (rhythm !== "organ" || harmony !== "pad" || ds.some((v) => v !== "internal") || bassPreset !== "sub") {
    tokens.push(`k${rhythm}.${harmony}.${drumToken}.${bassPreset}`);
  }

  const mix = [
    Math.round((state.volumes?.master  ?? 0.8)  * 100),
    Math.round((state.volumes?.rhythm  ?? 0.55) * 100),
    Math.round((state.volumes?.harmony ?? 0.35) * 100),
    Math.round((state.volumes?.drums   ?? 0.75) * 100),
    Math.round((state.bass?.volume     ?? 0.65) * 100),
  ];
  const timings = [
    Math.round((state.strumLength ?? 0.12) * 100),
    Math.round((state.padAttack   ?? 0.08) * 100),
  ];
  if (mix.join(".") !== "80.55.35.75.65" || timings[0] !== 12 || timings[1] !== 8) {
    tokens.push(`m${mix.join(".")}${timings[0] === 12 && timings[1] === 8 ? "" : `.${timings.join(".")}`}`);
  }

  const bDef = { enabled: false, preset: "sub", octave: 2, filter: 420, glide: 4, release: 22 };
  const bv = {
    enabled: state.bass?.enabled ? 1 : 0,
    preset:  bassPreset,
    octave:  state.bass?.octave  ?? 2,
    filter:  Math.round(state.bass?.filter  ?? 420),
    glide:   Math.round((state.bass?.glide   ?? 0.04) * 100),
    release: Math.round((state.bass?.release ?? 0.22) * 100),
  };
  if (bv.enabled !== 0 || bv.preset !== bDef.preset || bv.octave !== bDef.octave ||
      bv.filter !== bDef.filter || bv.glide !== bDef.glide || bv.release !== bDef.release) {
    tokens.push(`b${bv.enabled}.${bv.preset}.${bv.octave}.${bv.filter}.${bv.glide}.${bv.release}`);
  }

  return tokens.join(",");
}

function decodeHeader(token) {
  const snapshot = {};
  String(token || "").split(",").forEach((part) => {
    if (!part) return;
    if (part.startsWith("t")) {
      const fields = part.slice(1).split(".");
      snapshot.bpm = Math.trunc(clampNumber(Number(fields[0]), 60, 200, 100));
      if (fields.length >= 3 && fields[2]) {
        try { snapshot.songTitle = base64UrlToUtf8(fields[2]).trim(); } catch {}
      }
      return;
    }
    if (part.startsWith("s")) {
      const subdiv = part.slice(1);
      if (isValidSubdivision(subdiv)) {
        snapshot.subdiv = subdiv;
      }
      return;
    }
    if (part.startsWith("k")) {
      const [rhythm, harmony, drumToken, bassPreset] = part.slice(1).split(".");
      const drumValues = String(drumToken || "").split("-");
      snapshot.sounds = {
        rhythm:  SOUND_NAMES.has(rhythm)  ? rhythm  : "organ",
        harmony: SOUND_NAMES.has(harmony) ? harmony : "pad",
        drums: Object.fromEntries(TRACKS.map((t, i) => {
          const v = drumValues.length === TRACKS.length ? drumValues[i] : drumValues[0];
          return [t.key, DRUM_KIT_NAMES.has(v) ? v : "internal"];
        })),
      };
      snapshot.bass = { ...(snapshot.bass || {}), preset: BASS_PRESET_NAMES.has(bassPreset) ? bassPreset : "sub" };
      return;
    }
    if (part.startsWith("m")) {
      const [master, rhythm, harmony, drums, bass, strumLength, padAttack] = part.slice(1).split(".");
      snapshot.volumes = {
        master:  clampNumber(Number(master)  / 100, 0, 1, 0.8),
        rhythm:  clampNumber(Number(rhythm)  / 100, 0, 1, 0.55),
        harmony: clampNumber(Number(harmony) / 100, 0, 1, 0.35),
        drums:   clampNumber(Number(drums)   / 100, 0, 1, 0.75),
      };
      snapshot.bass = { ...(snapshot.bass || {}), volume: clampNumber(Number(bass) / 100, 0, 1, 0.65) };
      if (strumLength !== undefined) snapshot.strumLength = clampNumber(Number(strumLength) / 100, 0.05, 0.25, 0.12);
      if (padAttack   !== undefined) snapshot.padAttack   = clampNumber(Number(padAttack)   / 100, 0.02, 0.4,  0.08);
      return;
    }
    if (part.startsWith("b")) {
      const [enabled, preset, octave, filter, glide, release] = part.slice(1).split(".");
      snapshot.bass = {
        ...(snapshot.bass || {}),
        enabled: enabled === "1",
        preset:  BASS_PRESET_NAMES.has(preset) ? preset : (snapshot.bass?.preset || "sub"),
        octave:  Math.trunc(clampNumber(Number(octave),  0,   4,    2)),
        filter:  clampNumber(Number(filter), 120, 1800, 420),
        glide:   clampNumber(Number(glide)   / 100, 0,   0.2,  0.04),
        release: clampNumber(Number(release) / 100, 0.04, 1,   0.22),
      };
    }
  });
  return snapshot;
}

// --- V1 migration ---

/**
 * Decodes a v1 share payload (base64url JSON `{v:1, p:{...}}`).
 * Returns the preset snapshot, or null if the payload is not a valid v1 payload.
 */
function decodeV1Payload(encoded) {
  try {
    const parsed = JSON.parse(base64UrlToUtf8(encoded));
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.v !== 1) return null;
    if (!parsed.p || typeof parsed.p !== "object") return null;
    return parsed.p;
  } catch {
    return null;
  }
}

// --- URL helpers ---

function collectIndexed(params, key) {
  const values = [];
  for (const [paramKey, value] of params.entries()) {
    const match = paramKey.match(new RegExp(`^${key}\\[(\\d+)\\]$`));
    if (!match) continue;
    values[Number(match[1])] = value;
  }
  return values.filter((v) => v !== undefined);
}

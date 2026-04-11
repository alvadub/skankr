import { parseArrangementBody } from "./arrangement.js";
import { resolveChannelToken } from "./channels.js";

function findSuffixDashCommentIndex(line) {
  const match = String(line || "").match(/\s--\s/);
  if (!match || typeof match.index !== "number") return -1;
  if (!/\S/.test(String(line || "").slice(0, match.index))) return -1;
  return match.index;
}

function stripInlineComment(line) {
  const value = String(line || "");
  const semicolonIndex = value.indexOf(";");
  const dashCommentIndex = findSuffixDashCommentIndex(value);
  if (semicolonIndex < 0 && dashCommentIndex < 0) return value;
  if (semicolonIndex < 0) return value.slice(0, dashCommentIndex);
  if (dashCommentIndex < 0) return value.slice(0, semicolonIndex);
  return value.slice(0, Math.min(semicolonIndex, dashCommentIndex));
}

function splitDefinitionSuffixComment(line) {
  const raw = String(line || "");
  const semicolonIndex = raw.indexOf(";");
  const scoped = semicolonIndex >= 0 ? raw.slice(0, semicolonIndex) : raw;
  const dashCommentIndex = findSuffixDashCommentIndex(scoped);
  if (dashCommentIndex < 0) return { code: scoped, comment: "" };
  return {
    code: scoped.slice(0, dashCommentIndex),
    comment: scoped.slice(dashCommentIndex + 4).trim(),
  };
}

export function extractDraftTempo(input) {
  const m = String(input || "").match(/^\s*;\s*tempo\s*:\s*(\d+(?:\.\d+)?)\s*$/im);
  if (!m) return null;
  const n = Math.round(parseFloat(m[1]));
  if (!Number.isFinite(n)) return null;
  return Math.max(60, Math.min(200, n));
}

export function extractDraftBars(input) {
  const m = String(input || "").match(/^\s*;\s*bars\s*:\s*(\d+)\s*$/im);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(4, Math.min(32, n));
}

export function extractDraftKey(input) {
  const m = String(input || "").match(/^\s*;\s*key\s*:\s*([+-]?\d+)\s*$/im);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(-12, Math.min(12, n));
}

export function extractDraftBankSelection(input) {
  const out = {
    bank: null,
    drums: null,
    instruments: null,
  };

  String(input || "").split(/\r?\n/).forEach((line) => {
    const m = String(line).match(/^\s*;\s*bank(?:\.(drums|instruments))?\s*:\s*([a-z0-9._-]+)\s*$/i);
    if (!m) return;
    const scope = String(m[1] || "bank").toLowerCase();
    const value = String(m[2] || "").trim();
    if (!value) return;
    if (scope === "bank") out.bank = value;
    if (scope === "drums") out.drums = value;
    if (scope === "instruments") out.instruments = value;
  });

  return out;
}

export function buildMixFromMerged(midi) {
  const mix = [];

  function get(nth, name) {
    const key = nth + name;

    if (!get[key]) {
      const track = [nth, name, []];
      mix.push(track);
      get[key] = { track };
    }
    return get[key];
  }

  midi.forEach((section) => {
    section.forEach((parts) => {
      parts.forEach((e) => {
        const { track } = get(e[0], e[1]);
        for (let i = 0; i < e[2].length; i += 1) {
          track[2].push(e[2][i]);
        }
      });
    });
  });
  return mix;
}

export function buildTrackLineMap(input, options = {}) {
  const map = new Map();
  let currentTrack = null;
  String(input || "").split(/\r?\n/).forEach((rawLine, lineNumber) => {
    const line = stripInlineComment(rawLine).trim();
    if (!line) return;

    if (/^#{1,2}\s+/.test(line) && !/^#\d+/.test(line)) {
      currentTrack = line.replace(/^#{1,2}\s+/, "").trim();
      return;
    }

    if (!currentTrack) return;
    const match = line.match(/^(#[^\s]+)\b/);
    if (!match) return;
    const resolvedChannel = resolveChannelToken(match[1], options.channelAliases);
    const key = `${parseInt(resolvedChannel.slice(1), 10)}/${currentTrack}`;
    const prev = map.get(key) || [];
    if (!prev.includes(lineNumber)) prev.push(lineNumber);
    map.set(key, prev);
  });
  return map;
}

export function collectVariableDefinitions(input) {
  const out = [];
  const seen = new Set();
  String(input || "").split(/\r?\n/).forEach((raw, idx) => {
    const { code, comment } = splitDefinitionSuffixComment(raw);
    const line = code.trim();
    const match = line.match(/^\s*([%&][^\s]+)\s+/);
    if (!match) return;
    const name = match[1];
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push({ name, line: idx + 1, comment });
  });
  return out;
}

export function applyLatestInputWins(context) {
  Object.values((context && context.tracks) || {}).forEach((channels) => {
    Object.keys(channels || {}).forEach((ch) => {
      const clips = channels[ch] || [];
      const lastInput = clips.reduce((idx, clip, i) => (clip && clip.input ? i : idx), -1);
      if (lastInput > 0) channels[ch] = clips.slice(lastInput);
    });
  });
  return context;
}

export function buildArrangementDisplayExpansion(sourceText) {
  const lines = String(sourceText || "").split(/\r?\n/);
  const expanded = [];
  let tokenOrder = 0;
  let blockOrder = 0;

  lines.forEach((rawLine) => {
    const noComment = rawLine.replace(/;.*$/, "");
    const trimmed = noComment.trim();
    if (!trimmed.startsWith(">")) return;
    const body = trimmed.slice(1).trim();
    if (!body) return;
    const parsed = parseArrangementBody(body, {
      orderOffset: tokenOrder,
      blockOffset: blockOrder,
    });
    tokenOrder = parsed.nextOrder;
    blockOrder = parsed.nextBlock;
    expanded.push(...parsed.expanded);
  });

  return expanded;
}

export function buildSectionTimeline(context, merged, sourceText) {
  if (!context || !Array.isArray(merged) || merged.length === 0) return [];
  if (!context.main || !context.main.length) return [];

  const expanded = buildArrangementDisplayExpansion(sourceText || "");
  const flattenedSections = [];
  merged.forEach((group) => {
    (group || []).forEach((parts) => {
      flattenedSections.push(parts);
    });
  });

  const timeline = [];
  let cursor = 0;
  flattenedSections.forEach((parts, idx) => {
    const mergedBeats = (parts || []).reduce((max, t) => {
      const len = Array.isArray(t[2]) ? t[2].length : 0;
      return Math.max(max, len);
    }, 0);
    const token = expanded[idx] || expanded[expanded.length - 1] || null;
    const name = token ? token.name : null;
    const displayOrder = token ? token.displayOrder : null;
    const blockId = token ? token.blockId : null;
    const blockLive = token ? Boolean(token.blockLive) : false;
    const blockStartOrder = token ? token.blockStartOrder : null;
    const blockEndOrder = token ? token.blockEndOrder : null;
    const beats = Math.max(1, mergedBeats);
    const start = cursor;
    const end = Math.max(start, start + beats - 1);
    cursor = end + 1;
    timeline.push({
      name,
      displayOrder,
      start,
      end,
      blockId,
      blockLive,
      blockStartOrder,
      blockEndOrder,
      blockStart: null,
      blockEnd: null,
    });
  });

  const blocks = new Map();
  timeline.forEach((item) => {
    if (!item.blockId) return;
    const prev = blocks.get(item.blockId);
    if (!prev) {
      blocks.set(item.blockId, {
        start: item.start,
        end: item.end,
      });
      return;
    }
    prev.start = Math.min(prev.start, item.start);
    prev.end = Math.max(prev.end, item.end);
  });

  timeline.forEach((item) => {
    if (!item.blockId) return;
    const block = blocks.get(item.blockId);
    if (!block) return;
    item.blockStart = block.start;
    item.blockEnd = block.end;
  });

  return timeline;
}

export function getSectionAtBeat(sectionTimeline, beatIndex) {
  const index = (sectionTimeline || []).findIndex((section) => (
    section.name && beatIndex >= section.start && beatIndex <= section.end
  ));
  if (index < 0) return null;
  return { index, item: sectionTimeline[index] };
}

export function findTimelineIndex(sectionTimeline, displayOrder, name) {
  if (typeof displayOrder === "number" && displayOrder >= 0) {
    const idx = (sectionTimeline || []).findIndex((section) => section.displayOrder === displayOrder);
    if (idx >= 0) return idx;
  }
  if (name) return (sectionTimeline || []).findIndex((section) => section.name === name);
  return -1;
}

export function getMaxPatternSlots(context) {
  if (!context || !context.trackPatternSlots) return 0;
  const slots = Object.values(context.trackPatternSlots);
  if (slots.length === 0) return 0;
  return Math.max(...slots);
}

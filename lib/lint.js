import { resolveChannelToken } from "./channels.js";
import { merge, pack } from "./mixup.js";
import { parse, reduce } from "./parser.js";
import { buildArrangementDisplayExpansion } from "./playground.js";
import { split } from "./tokenize.js";
import { flatten } from "./utils.js";

function deepVisit(node, fn) {
  if (Array.isArray(node)) {
    node.forEach((item) => deepVisit(item, fn));
    return;
  }
  fn(node);
}

function countPatternStats(node) {
  const stats = {
    hits: 0,
    slots: 0,
    sustainAfterHit: true,
  };
  let seenHit = false;

  deepVisit(node, (value) => {
    if (typeof value !== "string") return;

    const parts = split(value);
    deepVisit(parts, (part) => {
      if (part === "x") {
        stats.hits += 1;
        stats.slots += 1;
        seenHit = true;
        return;
      }
      if (part === "-") {
        stats.slots += 1;
        return;
      }
      if (part === "_") {
        stats.slots += 1;
        if (!seenHit) stats.sustainAfterHit = false;
      }
    });
  });

  return stats;
}

function flattenSectionBeats(beats) {
  let active = 0;
  deepVisit(beats, (tick) => {
    if (tick && typeof tick === "object" && tick.v > 0) active += 1;
  });
  return active;
}

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

function scanClipLineMap(source, opts = {}) {
  const clipLineMap = new Map();
  const explicitClipCounts = new Map();
  const sectionNames = new Set();
  const sectionLineMap = new Map();
  const trackLineMap = new Map();
  const trackHasClip = new Set();
  const variableDefinitionLineMap = new Map();
  const variableReferenceCounts = new Map();
  const patternDefinitionLineMap = new Map();
  const patternReferenceCounts = new Map();
  let track = null;
  let prefix = "";
  const counters = new Map();

  String(source || "").split(/\r?\n/).forEach((rawLine, nth) => {
    const line = stripInlineComment(rawLine).trim();
    if (!line) return;

    if (line.indexOf("# ") >= 0) {
      track = line.split(/\s+/).slice(1).join(" ");
      if (track && !trackLineMap.has(track)) trackLineMap.set(track, nth + 1);
      prefix = "";
      return;
    }

    if (line.charAt() === "%") {
      const [name, ...rest] = line.split(/\s+/);
      if (/^%[a-zA-Z_]\w*$/.test(name) && !variableDefinitionLineMap.has(name)) {
        variableDefinitionLineMap.set(name, nth + 1);
      }
      rest.forEach((token) => {
        if (/^%[a-zA-Z_]\w*$/.test(token)) {
          variableReferenceCounts.set(token, (variableReferenceCounts.get(token) || 0) + 1);
        }
        if (/^&[a-zA-Z_]\w*$/.test(token)) {
          patternReferenceCounts.set(token, (patternReferenceCounts.get(token) || 0) + 1);
        }
      });
      return;
    }

    if (line.charAt() === "&") {
      const [name, ...rest] = line.split(/\s+/);
      if (/^&[a-zA-Z_]\w*$/.test(name) && !patternDefinitionLineMap.has(name)) {
        patternDefinitionLineMap.set(name, nth + 1);
      }
      rest.forEach((token) => {
        if (/^%[a-zA-Z_]\w*$/.test(token)) {
          variableReferenceCounts.set(token, (variableReferenceCounts.get(token) || 0) + 1);
        }
        if (/^&[a-zA-Z_]\w*$/.test(token)) {
          patternReferenceCounts.set(token, (patternReferenceCounts.get(token) || 0) + 1);
        }
      });
      return;
    }

    if (line.charAt() === "@") {
      const name = line.substr(1).split(/\s+/)[0];
      prefix = name || "";
      if (prefix) {
        sectionNames.add(prefix);
        if (!sectionLineMap.has(prefix)) sectionLineMap.set(prefix, nth + 1);
      }
      return;
    }

    line.split(/\s+/).forEach((token) => {
      if (/^%[a-zA-Z_]\w*$/.test(token)) {
        variableReferenceCounts.set(token, (variableReferenceCounts.get(token) || 0) + 1);
      }
      if (/^&[a-zA-Z_]\w*$/.test(token)) {
        patternReferenceCounts.set(token, (patternReferenceCounts.get(token) || 0) + 1);
      }
    });

    if (!track) return;
    if (!/^#[^\s]+\b/.test(line)) return;

    const channelValue = line.match(/^(#[^\s]+)\b/);
    if (!channelValue) return;
    let resolved;
    try {
      resolved = resolveChannelToken(channelValue[1], opts.channelAliases);
    } catch {
      return;
    }
    const channel = `${prefix}${resolved}`;
    const key = `${track}|${channel}`;
    const idx = counters.get(key) || 0;
    counters.set(key, idx + 1);
    explicitClipCounts.set(key, (explicitClipCounts.get(key) || 0) + 1);
    trackHasClip.add(track);
    clipLineMap.set(`${key}|${idx}`, nth + 1);
  });

  return {
    clipLineMap,
    explicitClipCounts,
    sectionNames,
    sectionLineMap,
    trackLineMap,
    trackHasClip,
    variableDefinitionLineMap,
    variableReferenceCounts,
    patternDefinitionLineMap,
    patternReferenceCounts,
  };
}

function inputSignature(clip, context) {
  if (!clip || !clip.input) return null;
  try {
    return JSON.stringify(reduce(clip.input, context.data));
  } catch {
    return null;
  }
}

function scanInvalidTokenPrefixes(source) {
  const warnings = [];
  String(source || "").split(/\r?\n/).forEach((rawLine, nth) => {
    const line = stripInlineComment(rawLine).trim();
    if (!line) return;

    const tokens = line.split(/\s+/);
    tokens.forEach((token) => {
      const pos = token.search(/[#@<%&>]/);
      if (pos <= 0) return;
      const prefix = token.slice(0, pos);
      const symbol = token.charAt(pos);
      let invalid = false;

      if (symbol === "#") {
        const noteLike = pos === 1 && /^[a-gA-G]$/.test(prefix) && /^\d/.test(token.slice(pos + 1));
        invalid = !noteLike;
      } else {
        invalid = true;
      }

      if (!invalid) return;
      warnings.push({
        rule: "invalid-token-prefix",
        message: `Token '${token}' has invalid prefix '${prefix}' before '${symbol}'.`,
        line: nth + 1,
      });
    });
  });
  return warnings;
}

function parseErrorLine(error) {
  const text = String((error && error.message) || error || "");
  const match = text.match(/\bat line\s+(\d+)\b/i);
  if (!match) return null;
  const line = parseInt(match[1], 10);
  return Number.isInteger(line) && line > 0 ? line : null;
}

export function lintDub(source, opts = {}) {
  const report = {
    errors: [],
    warnings: [],
  };

  let context = opts.context;
  let merged = opts.merged;
  report.warnings.push(...scanInvalidTokenPrefixes(source));

  try {
    if (!context) context = parse(source);
  } catch (error) {
    report.errors.push({
      rule: "parse-error",
      message: error && error.message ? error.message : "Parse error",
      line: parseErrorLine(error),
      stack: error && error.stack ? String(error.stack) : null,
    });
    return report;
  }

  const {
    clipLineMap,
    explicitClipCounts,
    sectionNames,
    sectionLineMap,
    trackLineMap,
    trackHasClip,
    variableDefinitionLineMap,
    variableReferenceCounts,
    patternDefinitionLineMap,
    patternReferenceCounts,
  } = scanClipLineMap(source, opts);
  const expanded = buildArrangementDisplayExpansion(source);
  const usedSections = new Set(expanded.map((item) => item.name));
  expanded.forEach((item, idx) => {
    if (!sectionNames.has(item.name)) {
      report.errors.push({
        rule: "unknown-section",
        message: `Arrangement token '${item.name}' (index ${idx}) has no matching @section.`,
        line: null,
      });
    }
  });
  if (expanded.length > 0) {
    sectionNames.forEach((name) => {
      if (usedSections.has(name)) return;
      report.warnings.push({
        rule: "unused-section",
        message: `Section '@${name}' is defined but never used in arrangement.`,
        line: sectionLineMap.get(name) || null,
      });
    });
  }

  variableDefinitionLineMap.forEach((line, name) => {
    if ((variableReferenceCounts.get(name) || 0) > 0) return;
    report.warnings.push({
      rule: "unused-variable",
      message: `Variable '${name}' is defined but never used.`,
      line,
    });
  });

  patternDefinitionLineMap.forEach((line, name) => {
    if ((patternReferenceCounts.get(name) || 0) > 0) return;
    report.warnings.push({
      rule: "unused-pattern-variable",
      message: `Pattern variable '${name}' is defined but never used.`,
      line,
    });
  });

  Object.keys(context.tracks || {}).forEach((trackName) => {
    if (trackHasClip.has(trackName)) return;
    report.warnings.push({
      rule: "empty-track",
      message: `Track '${trackName}' has no channel clips.`,
      line: trackLineMap.get(trackName) || null,
    });
  });

  Object.entries(context.tracks || {}).forEach(([trackName, channels]) => {
    Object.entries(channels || {}).forEach(([channel, clips]) => {
      const channelMatch = String(channel).match(/#(\d+)$/);
      if (channelMatch && typeof opts.resolveInstrument === "function") {
        const program = parseInt(channelMatch[1], 10);
        const isValid = opts.resolveInstrument(String(program));
        if (!isValid) {
          report.warnings.push({
            rule: "invalid-instrument",
            message: `Track '${trackName}' channel '${channel}' uses unsupported instrument/program number '${program}'.`,
            line: clipLineMap.get(`${trackName}|${channel}|0`) || trackLineMap.get(trackName) || null,
          });
        }
      }

      const inputClips = (clips || []).filter((clip) => clip && clip.input);
      const explicitCount = explicitClipCounts.get(`${trackName}|${channel}`) || 0;
      const unmergedInputs = inputClips.filter((clip) => !clip.merge);
      const seenInputSignatures = new Set();
      let hasDuplicateInput = false;
      for (let i = 0; i < unmergedInputs.length; i += 1) {
        const signature = inputSignature(unmergedInputs[i], context);
        if (!signature) continue;
        if (seenInputSignatures.has(signature)) {
          hasDuplicateInput = true;
          break;
        }
        seenInputSignatures.add(signature);
      }

      if (explicitCount > 1 && hasDuplicateInput) {
        const line = clipLineMap.get(`${trackName}|${channel}|0`) || null;
        report.warnings.push({
          rule: "duplicate-input-clips",
          message: `Track '${trackName}' channel '${channel}' has repeated input clips without explicit '!' or '+' merge operator.`,
          line,
        });
      }

      (clips || []).forEach((clip, clipIndex) => {
        if (!clip || !clip.input) return;

        const line = clipLineMap.get(`${trackName}|${channel}|${clipIndex}`) || null;
        let input;
        let stats;
        let values = [];
        let notes = [];

        try {
          values = clip.values ? reduce(clip.values, context.data) : [];
          notes = clip.data ? reduce(clip.data, context.data) : [];
          input = flatten(reduce(clip.input, context.data, pack(values.slice(), notes.slice())));
          stats = countPatternStats(reduce(clip.input, context.data));
        } catch (error) {
          report.errors.push({
            rule: "clip-reduce-failed",
            message: `Unable to evaluate clip in '${trackName}' '${channel}': ${error.message}`,
            line,
            stack: error && error.stack ? String(error.stack) : null,
          });
          return;
        }

        const outOfRangeLevel = values.find((value) => (
          typeof value === "number"
          && Number.isFinite(value)
          && (value < 0 || value > 127)
        ));
        if (typeof outOfRangeLevel === "number") {
          report.warnings.push({
            rule: "invalid-level",
            message: `Track '${trackName}' '${channel}' has level/velocity '${outOfRangeLevel}' outside MIDI range 0..127.`,
            line,
          });
        }

        const noteEvents = notes;
        const noteCount = Array.isArray(noteEvents) ? noteEvents.length : 0;

        if (noteCount > stats.hits) {
          report.warnings.push({
            rule: "missing-pulses",
            message: `Track '${trackName}' '${channel}' has ${noteCount} notes/chords but only ${stats.hits} hit pulses.`,
            line,
          });
        }

        if (!stats.sustainAfterHit) {
          report.warnings.push({
            rule: "orphan-sustain",
            message: `Track '${trackName}' '${channel}' uses '_' before any 'x' hit in the same pattern.`,
            line,
          });
        }

        if (stats.hits > 0 && flattenSectionBeats(input) === 0) {
          report.warnings.push({
            rule: "silent-pattern",
            message: `Track '${trackName}' '${channel}' resolves to silence after reduction.`,
            line,
          });
        }
      });
    });
  });

  if (!merged) {
    try {
      merged = merge(context);
    } catch (error) {
      if (!report.errors.some((item) => item.rule === "unknown-section")) {
        report.errors.push({
          rule: "merge-error",
          message: error && error.message ? error.message : "Merge error",
          line: null,
          stack: error && error.stack ? String(error.stack) : null,
        });
      }
    }
  }

  if (expanded.length && Array.isArray(merged)) {
    let flatIndex = 0;
    merged.forEach((group) => {
      (group || []).forEach((parts) => {
        const token = expanded[flatIndex];
        if (token && flattenSectionBeats(parts.map((t) => t[2])) === 0) {
          report.warnings.push({
            rule: "silent-section",
            message: `Section '${token.name}' resolves to silence.`,
            line: null,
          });
        }
        flatIndex += 1;
      });
    });
  }

  return report;
}

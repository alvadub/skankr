import { merge } from "./mixup.js";
import { parse } from "./parser.js";
import { transform } from "./tokenize.js";

const DEFAULT_OPTIONS = {
  aggressive: false,
  maxVariableIndex: 1,
  minOccurrences: 2,
  minSequenceLength: 2,
};

const VARIABLE_PREFIX = "c";
const CANDIDATE_TOKEN_TYPES = new Set(["note", "chord"]);

function normalizeSource(source) {
  return String(source || "").replace(/\r/g, "").trim();
}

function findSuffixDashCommentIndex(rawLine) {
  const match = rawLine.match(/\s--\s/);
  if (!match || typeof match.index !== "number") return -1;
  if (!/\S/.test(rawLine.slice(0, match.index))) return -1;
  return match.index;
}

function stripComment(rawLine) {
  const semicolonIndex = rawLine.indexOf(";");
  const dashCommentIndex = findSuffixDashCommentIndex(rawLine);
  let index = -1;

  if (semicolonIndex >= 0 && dashCommentIndex >= 0) {
    index = Math.min(semicolonIndex, dashCommentIndex);
  } else if (semicolonIndex >= 0) {
    index = semicolonIndex;
  } else if (dashCommentIndex >= 0) {
    index = dashCommentIndex;
  }

  if (index < 0) return {
    code: rawLine,
    comment: "",
  };

  return {
    code: rawLine.slice(0, index),
    comment: rawLine.slice(index),
  };
}

function toInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function tokenText(token) {
  if (!token) return "";

  switch (token.type) {
    case "channel":
      return String(token.value);
    case "chord":
      return token.value.join("|");
    case "number":
    case "mode":
    case "param":
    case "value":
      return String(token.value);
    case "slice":
      return `${token.value[0]}..${token.value[1]}`;
    case "pattern":
      return token.value;
    default:
      return String(token.value);
  }
}

function tokensToText(tokens) {
  return tokens.map(tokenText).join(" ");
}

function isCandidateToken(token) {
  return CANDIDATE_TOKEN_TYPES.has(token && token.type);
}

function buildLineSegments(tokens, hasChannel) {
  const segments = [];

  if (!hasChannel) {
    return [{
      kind: "values",
      start: 0,
      end: tokens.length,
      tokens: tokens.slice(0, tokens.length),
    }];
  }

  const notes = tokens.findIndex((token) => ["note", "chord", "param"].includes(token.type));
  const index = tokens.findIndex((token) => token.type === "pattern");
  const value = index > 0 ? tokens.slice(index) : tokens;
  const offset = value.findIndex((token) => token.type !== "pattern");
  const inputs = tokens.slice(0, index > 0 ? index : 1);

  let values = [];
  let data = [];
  let valuesStart = -1;
  let dataStart = -1;

  if (notes > 0 && index === -1) {
    values = value.slice(1, notes);
    valuesStart = 1;
    data = value.slice(notes);
    dataStart = valuesStart + values.length;
  } else if (offset > 0) {
    data = value.slice(offset);
    dataStart = index + offset;
  } else if (offset === 0) {
    values = value.slice(1);
    valuesStart = 1;
  }

  if (inputs.length > 1) {
    let rest = inputs.slice(1);

    if (
      rest[0]
      && rest[0].type === "value"
      && (rest[0].value === "!" || rest[0].value === "+")
    ) {
      rest = rest.slice(1);
    }

    if (rest.length > 0) {
      values = rest;
      valuesStart = 1;
    }
  }

  if (valuesStart >= 0 && values.length) {
    segments.push({
      kind: "values",
      start: valuesStart,
      end: valuesStart + values.length,
      tokens: tokens.slice(valuesStart, valuesStart + values.length),
    });
  }

  if (dataStart >= 0 && data.length) {
    segments.push({
      kind: "data",
      start: dataStart,
      end: dataStart + data.length,
      tokens: tokens.slice(dataStart, dataStart + data.length),
    });
  }

  return segments;
}

function parseClipLines(source) {
  const lines = normalizeSource(source).split("\n");
  const lineEntries = new Map();
  const segments = [];

  let prefix = "";
  let channel = null;

  lines.forEach((rawLine, lineNumber) => {
    const { code, comment } = stripComment(rawLine);
    const line = code.trim();

    if (!line) return;
    if (line.charAt() === ";") return;

    if (line.indexOf("# ") >= 0) {
      prefix = "";
      channel = null;
      return;
    }

    if (line.charAt() === "@") {
      prefix = line.substr(1).trim().split(" ")[0];
      channel = null;
      return;
    }

    if (line.charAt() === ">" || line.indexOf(":") > 0 || (line.charAt() === "%" && line.charAt(1) !== "%")) {
      return;
    }

    let tokens;
    try {
      tokens = transform(line);
    } catch (error) {
      const msg = typeof error === "string" ? error : error.message;
      throw new SyntaxError(`${msg}\n  at line ${lineNumber + 1}\n${line}`);
    }

    if (!tokens.length) return;

    const hasChannel = tokens[0] && tokens[0].type === "channel";
    if (!hasChannel && !channel) {
      throw new TypeError(`Missing channel, given '${line}'`);
    }

    if (hasChannel) {
      channel = `${prefix}${tokens[0].value}`;
      void channel;
    }

    const lineSegments = buildLineSegments(tokens, hasChannel);
    if (!lineSegments.length) return;

    const entry = {
      raw: rawLine,
      indent: rawLine.match(/^\s*/)[0] || "",
      comment,
      tokens,
      segments: [],
    };

    lineSegments.forEach((range) => {
      const segment = {
        id: segments.length,
        line: lineNumber,
        kind: range.kind,
        start: range.start,
        end: range.end,
        tokens: range.tokens,
      };
      segments.push(segment);
      entry.segments.push(segment);
    });

    lineEntries.set(lineNumber, entry);
  });

  return {
    lines,
    lineEntries,
    segments,
  };
}

function collectCandidates(segments, minSequenceLength) {
  const literals = new Map();
  const sequences = new Map();

  segments.forEach((segment) => {
    segment.tokens.forEach((token, index) => {
      if (token.type !== "chord") return;

      const text = tokenText(token);
      const key = `chord:${text}`;
      if (!literals.has(key)) {
        literals.set(key, {
          key,
          text,
          textLength: text.length,
          tokenCount: 1,
          occurrences: [],
        });
      }

      literals.get(key).occurrences.push({
        segmentId: segment.id,
        start: index,
        length: 1,
      });
    });

    if (segment.tokens.length < minSequenceLength) return;

    for (let start = 0; start < segment.tokens.length; start += 1) {
      if (!isCandidateToken(segment.tokens[start])) continue;

      const parts = [];
      for (let end = start; end < segment.tokens.length; end += 1) {
        const token = segment.tokens[end];
        if (!isCandidateToken(token)) break;

        parts.push(tokenText(token));
        if (parts.length < minSequenceLength) continue;

        const text = parts.join(" ");
        const key = `seq:${text}`;
        if (!sequences.has(key)) {
          sequences.set(key, {
            key,
            text,
            textLength: text.length,
            tokenCount: parts.length,
            occurrences: [],
          });
        }

        sequences.get(key).occurrences.push({
          segmentId: segment.id,
          start,
          length: parts.length,
        });

        const existing = sequences.get(key);
        if (parts.length > existing.tokenCount) {
          existing.tokenCount = parts.length;
          existing.textLength = text.length;
        }
      }
    }
  });

  return {
    literals: [...literals.values()],
    sequences: [...sequences.values()],
  };
}

function sortCandidates(candidates, options) {
  return candidates
    .filter((candidate) => candidate.occurrences.length >= options.minOccurrences)
    .sort((a, b) => {
      if (b.tokenCount !== a.tokenCount) return b.tokenCount - a.tokenCount;
      if (b.textLength !== a.textLength) return b.textLength - a.textLength;
      if (b.occurrences.length !== a.occurrences.length) return b.occurrences.length - a.occurrences.length;
      return a.key.localeCompare(b.key);
    });
}

function releaseMarks(perSegmentUsed, marks) {
  marks.forEach(({ segmentId, index }) => {
    const slots = perSegmentUsed[segmentId];
    if (slots) {
      slots[index] = false;
    }
  });
}

function pickCandidate(candidate, perSegmentUsed, options, stats) {
  const ordered = candidate.occurrences.slice().sort((a, b) => {
    if (a.segmentId !== b.segmentId) return a.segmentId - b.segmentId;
    return a.start - b.start;
  });

  const selected = [];
  const marks = [];

  ordered.forEach((occurrence) => {
    const used = perSegmentUsed[occurrence.segmentId] || (perSegmentUsed[occurrence.segmentId] = []);
    let conflict = false;

    for (let i = occurrence.start; i < occurrence.start + occurrence.length; i += 1) {
      if (used[i]) {
        conflict = true;
        break;
      }
    }
    if (conflict) return;

    for (let i = occurrence.start; i < occurrence.start + occurrence.length; i += 1) {
      used[i] = true;
      marks.push({
        segmentId: occurrence.segmentId,
        index: i,
      });
    }
    selected.push(occurrence);
  });

  if (selected.length < options.minOccurrences) {
    releaseMarks(perSegmentUsed, marks);
    return null;
  }

  const name = `${VARIABLE_PREFIX}${stats.nextVariable}`;
  const replacementText = `%${name}`;
  const definitionCost = options.aggressive ? 0 : (candidate.textLength + replacementText.length + 1);
  const savings = selected.length * (candidate.textLength - replacementText.length) - definitionCost;

  if (!options.aggressive && savings <= 0) {
    releaseMarks(perSegmentUsed, marks);
    return null;
  }

  stats.nextVariable += 1;
  stats.totalReplacements += selected.length;
  stats.totalTokenSavings += selected.length * (candidate.tokenCount - 1) - 1;

  return {
    name,
    selected,
    candidate,
    savings,
  };
}

function chooseCandidates(candidates, perSegmentUsed, options, stats) {
  const chosen = [];
  const ordered = sortCandidates(candidates, options);
  ordered.forEach((candidate) => {
    const picked = pickCandidate(candidate, perSegmentUsed, options, stats);
    if (!picked) return;

    chosen.push(picked);
  });
  return chosen;
}

function buildDefinitions(chosen, segments) {
  return chosen.map((item) => {
    const first = item.selected[0];
    const segment = segments[first.segmentId];
    const expression = segment.tokens
      .slice(first.start, first.start + first.length)
      .map(tokenText)
      .join(" ");

    return {
      name: `%${item.name}`,
      expression,
      line: `%${item.name} ${expression}`,
      replacements: item.selected.length,
      savings: item.savings,
    };
  });
}

function applyReplacements(parsed, chosen) {
  const replacementsByLine = new Map();

  chosen.forEach((item) => {
    const token = {
      type: "param",
      value: `%${item.name}`,
    };

    item.selected.forEach((occurrence) => {
      const segment = parsed.segments[occurrence.segmentId];
      const start = segment.start + occurrence.start;
      const end = segment.start + occurrence.start + occurrence.length;

      const list = replacementsByLine.get(segment.line) || [];
      list.push({ start, end, token });
      replacementsByLine.set(segment.line, list);
    });
  });

  const outLines = parsed.lines.slice();

  replacementsByLine.forEach((replacements, lineNumber) => {
    const entry = parsed.lineEntries.get(lineNumber);
    if (!entry) return;

    const lineTokens = entry.tokens.slice();
    replacements
      .sort((a, b) => b.start - a.start)
      .forEach((item) => {
        lineTokens.splice(item.start, item.end - item.start, item.token);
      });

    outLines[lineNumber] = `${entry.indent}${tokensToText(lineTokens)}${entry.comment}`;
  });

  return outLines;
}

function insertDefinitions(lines, definitions) {
  if (!definitions.length) return lines;

  const definitionLines = definitions.map((item) => item.line);
  let insertAt = 0;

  while (insertAt < lines.length) {
    const { code } = stripComment(lines[insertAt]);
    const clean = code.trim();

    if (!clean || clean.charAt() === ";" || clean.charAt() === "%") {
      insertAt += 1;
      continue;
    }

    break;
  }

  const output = lines.slice();
  output.splice(insertAt, 0, ...definitionLines);
  return output;
}

function parseExistingVariableIndexes(ast) {
  return Object.keys(ast.data || {})
    .filter((name) => /^%c\d+$/.test(name))
    .map((name) => parseInt(name.slice(2), 10))
    .filter((name) => Number.isFinite(name));
}

function safeMerge(ctx) {
  try {
    return merge(ctx);
  } catch {
    return null;
  }
}

export function compressDub(source, opts = {}) {
  const options = {
    ...DEFAULT_OPTIONS,
    ...opts,
    minOccurrences: toInt(opts.minOccurrences, DEFAULT_OPTIONS.minOccurrences),
    minSequenceLength: toInt(opts.minSequenceLength, DEFAULT_OPTIONS.minSequenceLength),
  };

  const normalized = normalizeSource(source);
  const sourceAst = parse(normalized);

  const parsed = parseClipLines(normalized);
  const existing = parseExistingVariableIndexes(sourceAst);
  const nextVariable = Math.max(
    options.maxVariableIndex,
    existing.length ? Math.max(...existing) + 1 : options.maxVariableIndex,
  );

  const stats = {
    nextVariable,
    totalReplacements: 0,
    totalTokenSavings: 0,
    variables: 0,
  };

  const candidates = collectCandidates(parsed.segments, options.minSequenceLength);
  const usedBySegment = {};
  const chosenLiterals = chooseCandidates(candidates.literals, usedBySegment, options, stats);
  const chosenSequences = chooseCandidates(candidates.sequences, usedBySegment, options, stats);
  const chosen = [...chosenLiterals, ...chosenSequences];

  if (!chosen.length) {
    return {
      source: normalized,
      definitions: [],
      summary: {
        replacements: 0,
        variables: 0,
        tokenSavings: 0,
        charSavings: 0,
      },
      merged: safeMerge(sourceAst),
      mergedCompressed: null,
      hasCompressed: false,
    };
  }

  const definitions = buildDefinitions(chosen, parsed.segments);
  const replacedLines = applyReplacements(parsed, chosen);
  const withDefinitions = insertDefinitions(replacedLines, definitions);
  const output = normalizeSource(withDefinitions.join("\n"));

  return {
    source: output,
    definitions,
    summary: {
      replacements: stats.totalReplacements,
      variables: definitions.length,
      tokenSavings: stats.totalTokenSavings,
      charSavings: Math.max(0, normalized.length - output.length),
    },
    merged: safeMerge(sourceAst),
    mergedCompressed: safeMerge(parse(output)),
    hasCompressed: true,
  };
}

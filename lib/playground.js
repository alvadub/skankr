import { parseArrangementBody } from "./arrangement.js";

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

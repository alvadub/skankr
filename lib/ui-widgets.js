// UI Widgets - extracted from app.js for reuse across skanker (and eventually m0s)

export function parseChordPattern(rawPattern, maxSteps = 32) {
  const raw = String(rawPattern || "").trim();
  if (!raw) return [];
  if (/[^xX_\-\s|.0]/.test(raw)) return null;
  const symbols = [...raw.replace(/[\s|]/g, "").replace(/[.0]/g, "-")];
  if (!symbols.length || symbols.length > maxSteps) return null;
  return symbols;
}

export function chordPatternStats(pattern) {
  const stats = { pulses: 0, sustains: 0, rests: 0, steps: pattern.length };
  let hasActiveChord = false;
  pattern.forEach((symbol) => {
    if (symbol === "x" || symbol === "X" || (symbol === "_" && !hasActiveChord)) {
      stats.pulses += 1;
      hasActiveChord = true;
      return;
    }
    if (symbol === "_") {
      stats.sustains += 1;
      return;
    }
    stats.rests += 1;
    hasActiveChord = false;
  });
  return stats;
}

export function chordPatternSymbolGroups(symbols) {
  const groups = [];
  for (let index = 0; index < symbols.length; index += 4) {
    groups.push(symbols.slice(index, index + 4).join(""));
  }
  return groups.join(" ");
}

export function parseDrumPattern(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/[^xX_\-\s|.0]/.test(raw)) return null;
  const symbols = [...raw.replace(/[\s|]/g, "").replace(/[.0]/g, "-")];
  const maxSteps = 32;
  if (!symbols.length || symbols.length > maxSteps || maxSteps % symbols.length !== 0) return null;
  const expanded = [];
  while (expanded.length < maxSteps) expanded.push(...symbols);
  return expanded.slice(0, maxSteps).map((symbol) => {
    if (symbol === "X") return 1;
    if (symbol === "x") return 0.72;
    return 0;
  });
}

export function formatDrumPattern(values) {
  return values.map((v) => {
    if (v === 1) return "X";
    if (v >= 0.72) return "x";
    return "-";
  }).join("");
}
  const syncScroll = () => { preview.scrollLeft = input.scrollLeft; };
  const refresh = () => { render(preview, input.value); syncScroll(); };

  let cachedCharWidth = null;
  const getCharWidth = () => {
    if (!cachedCharWidth) {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      ctx.font = getComputedStyle(input).font;
      cachedCharWidth = ctx.measureText("x").width;
    }
    return cachedCharWidth;
  };
  const charIndexToStep = (value, charIndex) => {
    let step = -1;
    for (let i = 0; i <= Math.min(charIndex, value.length - 1); i++) {
      if (!/[\s|]/.test(value[i])) step++;
    }
    return Math.max(0, step);
  };
  const stepToCharIndex = (value, targetStep) => {
    let step = 0;
    for (let i = 0; i < value.length; i++) {
      if (/[\s|]/.test(value[i])) continue;
      if (step === targetStep) return i;
      step++;
    }
    return value.length;
  };
  const setHoveredStep = (step) => {
    preview.querySelectorAll("[data-step]").forEach((span) => {
      span.classList.toggle("input-hover", Number(span.dataset.step) === step);
    });
  };

  input.addEventListener("focus", () => requestAnimationFrame(() => {
    if (document.activeElement === input) input.setSelectionRange(input.selectionEnd, input.selectionEnd);
  }));
  input.addEventListener("scroll", syncScroll);
  input.addEventListener("select", syncScroll);
  const wrap = input.parentElement;
  wrap.addEventListener("mousemove", (e) => {
    const rect = input.getBoundingClientRect();
    const paddingLeft = parseFloat(getComputedStyle(input).paddingLeft) || 0;
    const x = e.clientX - rect.left - paddingLeft + input.scrollLeft;
    setHoveredStep(charIndexToStep(input.value, Math.max(0, Math.floor(x / getCharWidth()))));
  });
  wrap.addEventListener("mouseleave", () => {
    preview.querySelectorAll("[data-step].input-hover").forEach((s) => s.classList.remove("input-hover"));
  });

  preview.addEventListener("mousedown", (event) => event.preventDefault());
  preview.addEventListener("click", (event) => {
    const cell = event.target.closest("[data-step]");
    if (!cell) { input.focus(); return; }
    const stepIndex = Number(cell.dataset.step);
    const parsed = parse(input.value);
    if (!parsed || stepIndex < 0 || stepIndex >= parsed.length) return;
    const next = [...parsed];
    next[stepIndex] = cycle(parsed[stepIndex]);
    input.value = format(next);
    refresh();
    onToggle(next);
    if (input.isConnected) {
      const charPos = stepToCharIndex(input.value, stepIndex);
      input.focus();
      input.setSelectionRange(charPos, charPos + 1);
    }
  });
  return { refresh, syncScroll };
}
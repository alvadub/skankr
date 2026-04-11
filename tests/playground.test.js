import { describe, expect, it } from "bun:test";
import { parse } from "../lib/parser.js";
import {
  extractDraftTempo,
  extractDraftBars,
  extractDraftKey,
  extractDraftBankSelection,
  buildTrackLineMap,
  collectVariableDefinitions,
  applyLatestInputWins,
  buildArrangementDisplayExpansion,
  buildSectionTimeline,
  getSectionAtBeat,
  findTimelineIndex,
  getMaxPatternSlots,
} from "../lib/playground.js";

describe("playground helpers", () => {
  it("extracts and clamps draft header values", () => {
    expect(extractDraftTempo("; tempo: 500")).toBe(200);
    expect(extractDraftTempo("; tempo: 42")).toBe(60);
    expect(extractDraftBars("; bars: 2")).toBe(4);
    expect(extractDraftBars("; bars: 100")).toBe(32);
    expect(extractDraftKey("; key: -40")).toBe(-12);
    expect(extractDraftKey("; key: 40")).toBe(12);
    expect(extractDraftTempo("; foo: 120")).toBeNull();
  });

  it("extracts bank header selections", () => {
    const meta = extractDraftBankSelection(`
      ; bank: default
      ; bank.drums: tr808
      ; bank.instruments: gm
    `);
    expect(meta).toEqual({
      bank: "default",
      drums: "tr808",
      instruments: "gm",
    });
  });

  it("builds track line map from track and channel lines", () => {
    const src = `
      # lead
        #0 90 x---
      ## bass
        #33 80 x---
    `;
    const map = buildTrackLineMap(src);
    expect(map.get("0/lead")).toEqual([2]);
    expect(map.get("33/bass")).toEqual([4]);
  });

  it("builds track line map with suffix comments and aliases", () => {
    const src = `
      # drums -- bright
        #bd x--- -- kick
        #sd --x- -- snare
      # keys
        #piano x--- C4
    `;
    const map = buildTrackLineMap(src);
    expect(map.get("2001/drums")).toEqual([2]);
    expect(map.get("2004/drums")).toEqual([3]);
    expect(map.get("0/keys")).toEqual([5]);
  });

  it("collects variable definition comments", () => {
    const defs = collectVariableDefinitions(`
      %lead C4 D4 -- bright hook
      %bass C2 ; ignore semicolon comment
      &swing x-xx -- late push
      %lead E4 F4 -- duplicate should be ignored
    `);

    expect(defs).toEqual([
      { name: "%lead", line: 2, comment: "bright hook" },
      { name: "%bass", line: 3, comment: "" },
      { name: "&swing", line: 4, comment: "late push" },
    ]);
  });

  it("keeps only the latest input clip for duplicated channels", () => {
    const ctx = {
      tracks: {
        hats: {
          "#2035": [
            { input: [{ type: "pattern", value: "x-x-x-x-" }] },
            { values: [{ type: "number", value: 90 }] },
            { input: [{ type: "pattern", value: "xxxxxxx[xx]" }] },
          ],
        },
      },
    };
    applyLatestInputWins(ctx);
    const after = ctx.tracks.hats["#2035"];
    expect(after).toHaveLength(1);
    expect(after[0].input[0].value).toBe("xxxxxxx[xx]");
  });

  it("expands arrangement tokens with xN and %", () => {
    const expanded = buildArrangementDisplayExpansion(`
      > A x3 B % C x2
    `);
    expect(expanded.map((x) => x.name)).toEqual(["A", "A", "A", "B", "B", "C", "C"]);
  });

  it("expands bracket arrangement blocks", () => {
    const expanded = buildArrangementDisplayExpansion(`
      > [A B C %]
      > [A B] x3
    `);
    expect(expanded.map((x) => x.name)).toEqual([
      "A", "B", "C", "C",
      "A", "B", "A", "B", "A", "B",
    ]);
    expect(expanded.slice(0, 4).every((x) => x.blockLive)).toBe(true);
    expect(expanded.slice(4).every((x) => x.blockLive)).toBe(false);
  });

  it("builds section timeline and resolves section queries", () => {
    const context = {
      main: [[{ type: "value", value: "A" }]],
      tracks: { melody: { "A#0": [{}] } },
    };
    const merged = [[
      [["0", "melody", [{ v: 1 }, { v: 0 }, { v: 1 }, { v: 0 }]]],
      [["0", "melody", [{ v: 1 }, { v: 0 }]]],
    ]];
    const timeline = buildSectionTimeline(context, merged, "> A B");
    expect(timeline).toEqual([
      {
        name: "A",
        displayOrder: 0,
        start: 0,
        end: 3,
        blockId: null,
        blockLive: false,
        blockStartOrder: null,
        blockEndOrder: null,
        blockStart: null,
        blockEnd: null,
      },
      {
        name: "B",
        displayOrder: 1,
        start: 4,
        end: 5,
        blockId: null,
        blockLive: false,
        blockStartOrder: null,
        blockEndOrder: null,
        blockStart: null,
        blockEnd: null,
      },
    ]);
    expect(getSectionAtBeat(timeline, 4)).toEqual({
      index: 1,
      item: {
        name: "B",
        displayOrder: 1,
        start: 4,
        end: 5,
        blockId: null,
        blockLive: false,
        blockStartOrder: null,
        blockEndOrder: null,
        blockStart: null,
        blockEnd: null,
      },
    });
    expect(findTimelineIndex(timeline, 0, null)).toBe(0);
    expect(findTimelineIndex(timeline, null, "B")).toBe(1);
  });

  it("builds loop range metadata for live arrangement blocks", () => {
    const context = {
      main: [[{ type: "value", value: "A" }]],
      tracks: { melody: { "A#0": [{}] } },
    };
    const merged = [[
      [["0", "melody", [{ v: 1 }, { v: 0 }]]],
      [["0", "melody", [{ v: 1 }]]],
      [["0", "melody", [{ v: 1 }, { v: 0 }, { v: 1 }]]],
    ]];
    const timeline = buildSectionTimeline(context, merged, "> [A B C]");
    expect(timeline[0].blockId).toBe(timeline[1].blockId);
    expect(timeline[1].blockId).toBe(timeline[2].blockId);
    expect(timeline[0].blockLive).toBe(true);
    expect(timeline[0].blockStart).toBe(0);
    expect(timeline[2].blockEnd).toBe(5);
  });

  it("marks bracket tokens with shared block metadata", () => {
    const expanded = buildArrangementDisplayExpansion("> [A B C %]");
    expect(expanded.length).toBe(4);
    expect(expanded.every((item) => item.blockId === expanded[0].blockId)).toBe(true);
    expect(expanded.every((item) => Number.isFinite(item.blockStartOrder))).toBe(true);
    expect(expanded.every((item) => Number.isFinite(item.blockEndOrder))).toBe(true);
  });

  it("computes max pattern slots from parser context", () => {
    const ctx = parse(`
      # one
        #1 x---
      # two
        #2 x--- x---
      > A
    `);
    expect(getMaxPatternSlots(ctx)).toBe(8);
  });
});

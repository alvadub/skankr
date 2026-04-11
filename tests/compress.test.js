import { describe, expect, it } from "bun:test";
import { compressDub } from "../lib/compress.js";
import { parse } from "../lib/parser.js";
import { merge } from "../lib/mixup.js";

function normalize(value) {
  return String(value).replace(/\r/g, "").trim();
}

describe("compress", () => {
  it("keeps unchanged source when there is no profitable candidate", () => {
    const source = `
      # bass
      @A
        #1 x--- C4 D4 E4
        #1 x--- G4 A4 B4
    `;

    const result = compressDub(source, {
      minOccurrences: 3,
      minSequenceLength: 4,
    });

    expect(result.hasCompressed).toBe(false);
    expect(result.source).toBe(normalize(source));
    expect(result.summary.variables).toBe(0);
  });

  it("extracts repeated chord literals", () => {
    const source = `
      # bass
      @A
        #1 x--- C4|E4|G4 C4|E4|G4 C4|E4|G4
    `;

    const result = compressDub(source, {
      minOccurrences: 2,
      minSequenceLength: 2,
    });

    expect(result.hasCompressed).toBe(true);
    expect(result.definitions).toHaveLength(1);
    expect(result.definitions[0].name).toBe("%c1");
    expect(result.source).toContain("%c1");
    expect(result.source).toContain("%c1 %c1 %c1");
  });

  it("extracts repeated note and chord sequences", () => {
    const source = `
      # lead
      @A
        #1 x--- C4 D4 E4 F4 C4 D4 E4 F4 C4 D4 E4 F4
    `;

    const result = compressDub(source, {
      minOccurrences: 2,
      minSequenceLength: 4,
    });

    expect(result.hasCompressed).toBe(true);
    expect(result.definitions[0].name).toBe("%c1");
    expect(result.source).toMatch(/%c1 %c1 %c1/);
  });

  it("produces deterministic naming and order across runs", () => {
    const source = `
      # test
      @A
        #1 x--- C4 D4 E4 F4 C4 D4 E4 F4 C4 D4 E4 F4 C4|E4|G4 C4|E4|G4 C4|E4|G4
    `;

    const first = compressDub(source);
    const second = compressDub(source);

    expect(first.source).toBe(second.source);
    expect(first.definitions.map((entry) => entry.name)).toEqual(["%c1", "%c2"]);
  });

  it("keeps merged playback output unchanged", () => {
    const source = `
      # groove
      @A
        #1 x--- 80 C4 D4 E4 F4 C4 D4 E4 F4 C4 D4 E4 F4
        #1 x--- 80 G4 F4 E4 D4 G4 F4 E4 D4
      @B
        #1 x--- C4 D4 E4 F4 C4 D4 E4 F4 C4 D4 E4 F4
      > A A B
    `;

    const result = compressDub(source);
    const original = merge(parse(source));
    const rebuilt = merge(parse(result.source));

    expect(rebuilt).toEqual(original);
  });

  it("preserves suffix dash comments after rewrite", () => {
    const source = `
      # groove
      @A
        #1 x--- C4 D4 E4 F4 C4 D4 E4 F4 -- motif
      > A
    `;

    const result = compressDub(source, {
      minOccurrences: 2,
      minSequenceLength: 4,
    });

    expect(result.hasCompressed).toBe(true);
    expect(result.source).toContain("-- motif");
    expect(() => parse(result.source)).not.toThrow();
  });
});

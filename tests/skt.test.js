import { describe, it, expect } from "bun:test";
import {
  encodeHeader, decodeHeader,
  encodeScene, decodeScene,
  decodeV1Payload,
  collectIndexed,
  normalizeBassEvents,
  TRACKS,
} from "../skt.js";

// Real RIDDIM v1 share URL payload (the base64 after #s=)
const RIDDIM_V1 = "eyJ2IjoxLCJwIjp7InZlcnNpb24iOjEsInByZXNldE5hbWUiOiJkZWZhdWx0IiwidWlNb2RlIjoibGlzdGVuIiwic29uZ1RpdGxlIjoiUklERElNIiwic29uZ05vdGUiOiJMaXZlIGR1YiBza2V0Y2ggZm9yIGdyb292ZSwgY2hvcmRzLCBhbmQgYXJyYW5nZW1lbnQgcmV2aWV3LiIsImJwbSI6ODAsImN1cnJlbnRTY2VuZSI6MCwibG9vcEFjdGl2ZVNjZW5lIjpmYWxzZSwic3RydW1MZW5ndGgiOjAuMTMsInBhZEF0dGFjayI6MC4wOCwiZHJ1bVByZXNldFBhbmVsT3BlbiI6ZmFsc2UsImRydW1QcmVzZXRHZW5yZSI6InJlZ2dhZSIsImFjdGl2ZURydW1QcmVzZXQiOm51bGwsImNob3JkUHJlc2V0UGFuZWxPcGVuIjpmYWxzZSwiYWN0aXZlQ2hvcmRQcmVzZXQiOm51bGwsInNvdW5kcyI6eyJyaHl0aG0iOiJndWl0YXIiLCJoYXJtb255IjoiZ3VpdGFyIiwiZHJ1bXMiOnsia2ljayI6InN0YW5kYXJkIiwic25hcmUiOiJ0cjgwOCIsImhpaGF0Ijoic3RhbmRhcmQiLCJvcGVuaGF0IjoiamF6eiJ9fSwiYmFzcyI6eyJlbmFibGVkIjpmYWxzZSwicHJlc2V0IjoiY3VzdG9tIiwib2N0YXZlIjoyLCJ2b2x1bWUiOjAuNCwiZmlsdGVyIjozNjAsImdsaWRlIjowLjIsInJlbGVhc2UiOjAuMjUsInJlY29yZGluZyI6ZmFsc2UsImxheWVycyI6W3sic2hhcGUiOiJzYXd0b290aCIsImRldHVuZSI6MCwiZ2FpbiI6MX1dfSwidm9sdW1lcyI6eyJtYXN0ZXIiOjAuNjQsInJoeXRobSI6MC41NSwiaGFybW9ueSI6MC41NCwiZHJ1bXMiOjAuNjd9LCJjaG9yZENhdGFsb2ciOnsiQWIiOiJhYjQsZGI0LGU0IiwiQWRpbSI6ImEzLGM0LGViNCIsIkJtIjoiYjMsZDQsZiM0IiwiQyI6ImM0LGY0LGE0IiwiRGIiOiJkYjQsZjQsYTQiLCJEZGltIjoiZDQsZjQsYWI0IiwiRG0iOiJkNCxmNCxhNCIsIkRtL0MiOiJjNCxmNCxhNCIsIkRtL0RiIjoiZGI0LGY0LGE0In0sInNjZW5lcyI6W3sibmFtZSI6IklOVFJPIiwicmh5dGhtIjpbIiIsIiIsIkRtIiwiIiwiIiwiIiwiRG0iLCIiLCIiLCIiLCJEbSIsIiIsIiIsIiIsIkRtIiwiIiwiIiwiIiwiRG0iLCIiLCIiLCIiLCJEbSIsIiIsIiIsIiIsIkRtIiwiIiwiIiwiIiwiRGRpbSIsIiJdLCJoYXJtb255IjpbIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiIsIiJdLCJjaG9yZFBvb2xUZXh0Ijp7InJoeXRobSI6WyJEbSBEbSBEbSBEbSIsIkRtIERtIERtIERkaW0iXSwiaGFybW9ueSI6WyIiLCIiXX0sImJhc3MiOlt7InRpY2siOjAsIm1pZGkiOjM4LCJsZW5ndGgiOjEsInZlbG9jaXR5IjoxLCJjb2RlIjoiIn0seyJ0aWNrIjozMiwibWlkaSI6MzgsImxlbmd0aCI6MSwidmVsb2NpdHkiOjEsImNvZGUiOiIifSx7InRpY2siOjQ4LCJtaWRpIjozNSwibGVuZ3RoIjoxLCJ2ZWxvY2l0eSI6MSwiY29kZSI6IiJ9LHsidGljayI6NTYsIm1pZGkiOjM2LCJsZW5ndGgiOjEsInZlbG9jaXR5IjoxLCJjb2RlIjoiIn0seyJ0aWNrIjo2NCwibWlkaSI6MzgsImxlbmd0aCI6MSwidmVsb2NpdHkiOjEsImNvZGUiOiIifSx7InRpY2siOjgwLCJtaWRpIjo0MiwibGVuZ3RoIjoxLCJ2ZWxvY2l0eSI6MSwiY29kZSI6IiJ9LHsidGljayI6OTYsIm1pZGkiOjM4LCJsZW5ndGgiOjEsInZlbG9jaXR5IjoxLCJjb2RlIjoiIn0seyJ0aWNrIjoxMTIsIm1pZGkiOjM1LCJsZW5ndGgiOjEsInZlbG9jaXR5IjoxLCJjb2RlIjoiIn0seyJ0aWNrIjoxMjAsIm1pZGkiOjM2LCJsZW5ndGgiOjEsInZlbG9jaXR5IjoxLCJjb2RlIjoiIn1dLCJiYXNzVGV4dCI6eyJub3RlcyI6ImQyIGQyIGIxIGMyIGQyIGYjMiBkMiBiMSBjMiIsInBhdHRlcm4iOiJ4LS0tIC0tLS0gLS0tLSAtLS0tIC0tLS0gLS0tLSAtLS0tIC0tLS0geC0tLSAtLS0tIC0tLS0gLS0tLSB4LS0tIC0tLS0geC0tLSAtLS0tIHgtLS0gLS0tLSAtLS0tIC0tLS0geC0tLSAtLS0tIC0tLS0gLS0tLSB4LS0tIC0tLS0gLS0tLSAtLS0tIHgtLS0gLS0tLSB4LS0tIC0tLS0ifSwiZHJ1bXMiOnsia2ljayI6WzEsMCwwLDAsMSwwLDAsMCwxLDAsMCwwLDEsMCwwLDAsMSwwLDAsMCwxLDAsMCwwLDEsMCwwLDAsMSwwLDAsMF0sInNuYXJlIjpbMCwwLDAsMSwwLDAsMSwwLDAsMCwwLDEsMCwwLDEsMCwwLDAsMCwxLDAsMCwxLDAsMCwwLDAsMSwwLDAsMSwwXSwiaGloYXQiOlswLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDBdLCJvcGVuaGF0IjpbMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwXX0sIm11dGVzIjp7InJoeXRobSI6ZmFsc2UsImhhcm1vbnkiOmZhbHNlLCJiYXNzIjpmYWxzZSwiZHJ1bXMiOnsia2ljayI6ZmFsc2UsInNuYXJlIjpmYWxzZSwiaGloYXQiOmZhbHNlLCJvcGVuaGF0IjpmYWxzZX19LCJ0cmFja1ZvbHVtZXMiOnsia2ljayI6MSwic25hcmUiOjAuNzUsImhpaGF0IjowLjY5LCJvcGVuaGF0IjowLjU1fX1dfX0=";

// --- helpers ---

function blankScene(overrides = {}) {
  return {
    name: "Scene 1",
    rhythm:  Array(32).fill(""),
    harmony: Array(32).fill(""),
    bass:    [],
    drums:   Object.fromEntries(TRACKS.map((t) => [t.key, Array(32).fill(0)])),
    mutes:   { rhythm: false, harmony: false, bass: false, drums: Object.fromEntries(TRACKS.map((t) => [t.key, false])) },
    trackVolumes: Object.fromEntries(TRACKS.map((t) => [t.key, t.volume])),
    ...overrides,
  };
}

// --- encodeHeader / decodeHeader ---

describe("encodeHeader / decodeHeader", () => {
  it("round-trips bpm", () => {
    const token = encodeHeader({ bpm: 120 });
    expect(decodeHeader(token).bpm).toBe(120);
  });

  it("round-trips song title", () => {
    const token = encodeHeader({ bpm: 80, songTitle: "RIDDIM" });
    expect(decodeHeader(token).songTitle).toBe("RIDDIM");
  });

  it("round-trips sound settings", () => {
    const token = encodeHeader({
      bpm: 80,
      sounds: { rhythm: "guitar", harmony: "guitar", drums: { kick: "standard", snare: "tr808", hihat: "standard", openhat: "jazz" } },
      bass: { preset: "custom" },
    });
    const h = decodeHeader(token);
    expect(h.sounds.rhythm).toBe("guitar");
    expect(h.sounds.harmony).toBe("guitar");
    expect(h.sounds.drums.kick).toBe("standard");
    expect(h.sounds.drums.snare).toBe("tr808");
    expect(h.bass.preset).toBe("custom");
  });

  it("round-trips volumes", () => {
    const token = encodeHeader({ bpm: 80, volumes: { master: 0.64, rhythm: 0.55, harmony: 0.54, drums: 0.67 }, bass: { volume: 0.4 } });
    const h = decodeHeader(token);
    expect(h.volumes.master).toBeCloseTo(0.64, 2);
    expect(h.volumes.rhythm).toBeCloseTo(0.55, 2);
    expect(h.bass.volume).toBeCloseTo(0.4, 2);
  });

  it("round-trips bass settings", () => {
    const token = encodeHeader({ bpm: 80, bass: { enabled: false, preset: "custom", octave: 2, filter: 360, glide: 0.2, release: 0.25 } });
    const h = decodeHeader(token);
    expect(h.bass.filter).toBeCloseTo(360, 0);
    expect(h.bass.glide).toBeCloseTo(0.2, 2);
    expect(h.bass.release).toBeCloseTo(0.25, 2);
  });

  it("omits k-token when sounds are all defaults", () => {
    const token = encodeHeader({ bpm: 100 });
    expect(token).not.toContain(",k");
  });

  it("omits m-token when mix is all defaults", () => {
    const token = encodeHeader({ bpm: 100 });
    expect(token).not.toContain(",m");
  });
});

// --- encodeScene / decodeScene ---

describe("encodeScene / decodeScene — blank scene", () => {
  it("round-trips blank scene", () => {
    const scene = blankScene();
    const token = encodeScene(scene, 0);
    const back  = decodeScene(token, 0);
    expect(back.rhythm).toEqual(scene.rhythm);
    expect(back.harmony).toEqual(scene.harmony);
    expect(back.mutes.rhythm).toBe(false);
  });

  it("blank drums produce compact tokens", () => {
    const token = encodeScene(blankScene(), 0);
    // all four drum tracks are empty → -!31 each (4 chars each, not 32)
    expect(token).toContain("-!31");
  });
});

describe("encodeScene / decodeScene — drum patterns", () => {
  it("round-trips reggae kick pattern", () => {
    const kick = Array(32).fill(0).map((_, i) => i % 4 === 0 ? 1 : 0);
    const scene = blankScene({ drums: { ...Object.fromEntries(TRACKS.map((t) => [t.key, Array(32).fill(0)])), kick } });
    const back  = decodeScene(encodeScene(scene, 0), 0);
    back.drums.kick.forEach((step, i) => {
      const hasHit = Boolean(step && step.length > 0);
      expect(hasHit).toBe(kick[i] > 0);
    });
  });

  it("uses tile compression for periodic kick", () => {
    const kick = [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0];
    const scene = blankScene({ drums: { ...Object.fromEntries(TRACKS.map((t) => [t.key, Array(32).fill(0)])), kick } });
    expect(encodeScene(scene, 0)).toContain("(X---)8");
  });
});

describe("encodeScene / decodeScene — chord grid", () => {
  it("round-trips rhythm chords", () => {
    const rhythm = Array(32).fill("").map((_, i) => i % 4 === 2 ? "Dm" : "");
    rhythm[30] = "Ddim";
    const scene = blankScene({ rhythm });
    const back  = decodeScene(encodeScene(scene, 0), 0);
    expect(back.rhythm[2]).toBe("Dm");
    expect(back.rhythm[30]).toBe("Ddim");
    expect(back.rhythm[0]).toBe("");
  });

  it("uses !N for rest runs in chord grid", () => {
    const rhythm = Array(32).fill("").map((_, i) => i % 4 === 2 ? "Dm" : "");
    const scene = blankScene({ rhythm });
    expect(encodeScene(scene, 0)).toContain("_!");
  });
});

describe("encodeScene / decodeScene — bass", () => {
  it("round-trips bass events", () => {
    const bass = [
      { tick: 0,  midi: 38, length: 8, velocity: 1 },
      { tick: 32, midi: 35, length: 4, velocity: 1 },
    ];
    const scene = blankScene({ bass });
    const back  = decodeScene(encodeScene(scene, 0), 0);
    expect(back.bass).toHaveLength(2);
    expect(back.bass[0].midi).toBe(38);
    expect(back.bass[1].midi).toBe(35);
  });
});

describe("encodeScene / decodeScene — mutes", () => {
  it("round-trips mute flags", () => {
    const scene = blankScene({ mutes: { rhythm: true, harmony: false, bass: false, drums: Object.fromEntries(TRACKS.map((t) => [t.key, false])) } });
    const back  = decodeScene(encodeScene(scene, 0), 0);
    expect(back.mutes.rhythm).toBe(true);
    expect(back.mutes.harmony).toBe(false);
  });

  it("round-trips drum mutes", () => {
    const scene = blankScene({ mutes: { rhythm: false, harmony: false, bass: false, drums: { kick: false, snare: false, hihat: true, openhat: false } } });
    const back  = decodeScene(encodeScene(scene, 0), 0);
    expect(back.mutes.drums.hihat).toBe(true);
    expect(back.mutes.drums.kick).toBe(false);
  });
});

describe("encodeScene / decodeScene — custom name", () => {
  it("round-trips scene name", () => {
    const scene = blankScene({ name: "INTRO" });
    const back  = decodeScene(encodeScene(scene, 0), 0);
    expect(back.name).toBe("INTRO");
  });

  it("omits default scene name", () => {
    const token = encodeScene(blankScene({ name: "Scene 1" }), 0);
    expect(token).not.toContain(".n");
  });
});

// --- v1 → v2 migration ---

describe("v1 → v2 migration via decodeV1Payload", () => {
  it("decodes the RIDDIM v1 payload successfully", () => {
    const p = decodeV1Payload(RIDDIM_V1);
    expect(p).not.toBeNull();
    expect(p.songTitle).toBe("RIDDIM");
    expect(p.bpm).toBe(80);
    expect(p.scenes).toHaveLength(1);
  });

  it("rejects non-v1 payloads", () => {
    expect(decodeV1Payload("notbase64!!!")).toBeNull();
    expect(decodeV1Payload(btoa(JSON.stringify({ v: 2, p: {} })))).toBeNull();
  });

  it("re-encoded header is compressed vs raw JSON", () => {
    const p = decodeV1Payload(RIDDIM_V1);
    const token = encodeHeader(p);
    expect(token.length).toBeLessThan(JSON.stringify(p).length / 5);
  });

  it("re-encoded header round-trips bpm and title", () => {
    const p = decodeV1Payload(RIDDIM_V1);
    const h = decodeHeader(encodeHeader(p));
    expect(h.bpm).toBe(80);
    expect(h.songTitle).toBe("RIDDIM");
  });

  it("re-encoded header round-trips sounds", () => {
    const p = decodeV1Payload(RIDDIM_V1);
    const h = decodeHeader(encodeHeader(p));
    expect(h.sounds.rhythm).toBe("guitar");
    expect(h.sounds.drums.snare).toBe("tr808");
    expect(h.sounds.drums.openhat).toBe("jazz");
  });

  it("encoded scene is far shorter than raw v1 JSON", () => {
    const p = decodeV1Payload(RIDDIM_V1);
    const scene0 = p.scenes[0];
    const token = encodeScene(scene0, 0);
    expect(token.length).toBeLessThan(JSON.stringify(scene0).length / 5);
  });

  it("kick pattern compresses to tile form", () => {
    const p = decodeV1Payload(RIDDIM_V1);
    expect(encodeScene(p.scenes[0], 0)).toContain("(X---)8");
  });

  it("empty hihat/openhat compress to !N form", () => {
    const p = decodeV1Payload(RIDDIM_V1);
    expect(encodeScene(p.scenes[0], 0)).toContain("-!31");
  });

  it("chord grid uses !N for rest runs", () => {
    const p = decodeV1Payload(RIDDIM_V1);
    const token = encodeScene(p.scenes[0], 0);
    expect(token).toContain("_!");
  });

  it("round-trips all drum patterns losslessly through encode/decode", () => {
    const p = decodeV1Payload(RIDDIM_V1);
    const scene0 = p.scenes[0];
    const back = decodeScene(encodeScene(scene0, 0), 0);
    ["kick", "snare", "hihat", "openhat"].forEach((key) => {
      back.drums[key].forEach((step, i) => {
        const hasHit = Boolean(step && step.length > 0);
        const origHasHit = (scene0.drums[key][i] ?? 0) > 0;
        expect(hasHit).toBe(origHasHit);
      });
    });
  });

  it("round-trips chord grid including Ddim", () => {
    const p = decodeV1Payload(RIDDIM_V1);
    const back = decodeScene(encodeScene(p.scenes[0], 0), 0);
    expect(back.rhythm[2]).toBe("Dm");
    expect(back.rhythm[30]).toBe("Ddim");
    expect(back.rhythm[0]).toBe("");
  });

  it("all scenes encode and round-trip without loss", () => {
    const p = decodeV1Payload(RIDDIM_V1);
    p.scenes.forEach((scene, i) => {
      const token = encodeScene(scene, i);
      const back  = decodeScene(token, i);
      ["kick", "snare", "hihat", "openhat"].forEach((key) => {
        back.drums[key].forEach((step, j) => {
          const hasHit = Boolean(step && step.length > 0);
          const origHasHit = (scene.drums[key][j] ?? 0) > 0;
          expect(hasHit).toBe(origHasHit);
        });
      });
    });
  });
});

// --- collectIndexed ---

describe("collectIndexed", () => {
  it("extracts indexed params in order", () => {
    const params = new URLSearchParams("s=header&s[0]=scene0&s[1]=scene1&s[2]=scene2");
    expect(collectIndexed(params, "s")).toEqual(["scene0", "scene1", "scene2"]);
  });

  it("ignores non-indexed params", () => {
    const params = new URLSearchParams("s=header&s[0]=scene0");
    expect(collectIndexed(params, "s")).toEqual(["scene0"]);
  });
});

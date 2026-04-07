# Skanker v2 — Improvement Plan

Repo: https://github.com/alvadub/skanker  
Live: https://alvadub.github.io/skanker/

## Constraints

- Single-file static app (`index.html`). No build step, no bundler, no npm.
- All changes go inside `index.html`.
- Web Audio API only — no external audio files.
- Skanker grid is **32 steps = 2 bars**. All drum patterns must be defined in 32 steps.
- Existing functionality (chord grid, chord catalog, scenes, harmony engine) must not break.

---

## Feature 1 — Drum Preset Browser (highest priority)

### What to build

Add a **"Presets"** button above the drum grid. Clicking it opens an inline panel (not a modal) that slides in below the button. The panel contains:

1. **Genre tabs** — horizontal tab bar: `Reggae · Dub · Dancehall · Raggamuffin · Reggaetón · Ska · Rocksteady`
2. **Preset buttons** — one button per named pattern inside the active tab
3. **Description area** — one or two sentences below the buttons describing the selected preset
4. **DNA tags** — small inline badges showing genre lineage (e.g. `origin: reggae roots → child: dembow`)

### Behavior

- Clicking a preset button:
  - Loads the pattern into the drum grid (replaces current state)
  - Sets BPM to the preset's default BPM
  - Shows the description
  - Marks the button as active
- After loading, the grid remains fully editable — the preset is just a starting point
- Clicking the active preset button again does nothing (idempotent)
- Closing the panel does not clear the loaded preset

### Data structure

```js
const DRUM_PRESETS = {
  reggae: {
    label: 'Reggae',
    patterns: {
      'One drop': {
        bpm: 75,
        desc: 'Kick and snare land together only on beat 3. Beat 1 is empty — that absence is the groove.',
        dna: [{ label: 'style', text: 'reggae roots' }],
        // 32 steps = 2 bars. Each array is one drum lane.
        kick:   [0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
        snare:  [0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
        hihat:  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1, 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        hhOpen: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      },
      'Rockers': {
        bpm: 82,
        desc: 'Kick on all four beats, snare on 3. More active than one drop, still rooted in reggae swing.',
        dna: [{ label: 'style', text: 'reggae roots' }],
        kick:   [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0, 1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
        snare:  [0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
        hihat:  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1, 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        hhOpen: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      },
      'Steppers': {
        bpm: 85,
        desc: 'Kick on every eighth note. Hypnotic and relentless. Snare stays on 3. Common in dub and roots.',
        dna: [{ label: 'style', text: 'reggae / dub' }],
        kick:   [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0, 1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
        snare:  [0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
        hihat:  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        hhOpen: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      },
    }
  },

  dub: {
    label: 'Dub',
    patterns: {
      'Dub one drop': {
        bpm: 75,
        desc: 'One drop with space deliberately left for delay and reverb effects. The emptiness is the instrument.',
        dna: [{ label: 'parent', text: 'reggae one drop' }],
        kick:   [0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
        snare:  [0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
        hihat:  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1, 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        hhOpen: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      },
      'Dub break': {
        bpm: 75,
        desc: 'Everything drops out except the kick. The producer fills the silence with delay throws and reverb.',
        dna: [{ label: 'technique', text: 'dub mixing' }],
        kick:   [0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0, 0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0],
        snare:  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        hihat:  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        hhOpen: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      },
      'Open HH break': {
        bpm: 75,
        desc: 'Hi-hat opens gradually at the end of the bar, building tension before the next section.',
        dna: [{ label: 'technique', text: 'dub fill' }],
        kick:   [0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
        snare:  [0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1, 0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
        hihat:  [1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0, 1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
        hhOpen: [0,0,0,0,0,0,0,0,0,0,0,0,1,0,1,0, 0,0,0,0,0,0,0,0,0,0,0,0,1,0,1,0],
      },
    }
  },

  dancehall: {
    label: 'Dancehall',
    patterns: {
      'Rockers classic': {
        bpm: 90,
        desc: 'Kick on all four beats, snare on 3. More driving than reggae one drop. Popularized by Sly Dunbar.',
        dna: [{ label: 'origin', text: 'reggae roots' }, { label: 'evolution', text: 'dancehall' }],
        kick:   [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0, 1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
        snare:  [0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
        hihat:  [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0, 1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
        hhOpen: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      },
      'Dem Bow original': {
        bpm: 90,
        desc: 'The Shabba Ranks 1990 riddim — direct ancestor of reggaetón dembow. Syncopated snare on the "and" of 2.',
        dna: [{ label: 'origin', text: 'dancehall JA' }, { label: 'child', text: 'reggaetón dembow' }],
        kick:   [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0, 1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
        snare:  [0,0,0,0,1,0,1,0,0,0,0,0,1,0,1,0, 0,0,0,0,1,0,1,0,0,0,0,0,1,0,1,0],
        hihat:  [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0, 1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
        hhOpen: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      },
      'Riddim with clap': {
        bpm: 95,
        desc: 'Syncopated kick, snare on 2 and 4, clap on the "a" of 2 and 4. The clap anticipation is the dancehall signature.',
        dna: [{ label: 'bridge', text: 'reggae → reggaetón' }],
        kick:   [1,0,0,0,0,0,1,0,1,0,0,0,0,0,1,0, 1,0,0,0,0,0,1,0,1,0,0,0,0,0,1,0],
        snare:  [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0, 0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
        hihat:  [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0, 1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
        hhOpen: [0,0,0,1,0,0,1,0,0,0,0,1,0,0,1,0, 0,0,0,1,0,0,1,0,0,0,0,1,0,0,1,0],
      },
    }
  },

  raggamuffin: {
    label: 'Raggamuffin',
    patterns: {
      'Ragga digital': {
        bpm: 92,
        desc: 'Fully digital drum machine sound, late 80s Jamaica. Short punchy kick, dry clap. Directly influenced reggaetón producers.',
        dna: [{ label: 'direct parent', text: 'reggaetón' }],
        kick:   [1,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0, 1,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0],
        snare:  [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0, 0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
        hihat:  [1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1, 1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1],
        hhOpen: [0,0,0,1,0,0,1,0,0,0,0,1,0,0,1,0, 0,0,0,1,0,0,1,0,0,0,0,1,0,0,1,0],
      },
      'Sleng Teng style': {
        bpm: 100,
        desc: 'Inspired by Under Mi Sleng Teng (1985) — the first fully digital riddim. Casio MT-40 sound: cold, quantized, no reverb.',
        dna: [{ label: 'instrument', text: 'Casio MT-40' }, { label: 'year', text: '1985' }],
        kick:   [1,0,0,1,0,0,0,0,1,0,0,1,0,0,0,0, 1,0,0,1,0,0,0,0,1,0,0,1,0,0,0,0],
        snare:  [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0, 0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
        hihat:  [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0, 1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
        hhOpen: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      },
      'Ragga rim': {
        bpm: 88,
        desc: 'Rim shot between beats — the dry "toc" sound that fills reggae space and defines the ragga texture.',
        dna: [{ label: 'texture', text: 'rim shot ragga' }],
        kick:   [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0, 1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
        snare:  [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0, 0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
        hihat:  [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0, 1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
        hhOpen: [0,0,1,0,0,1,0,1,0,0,1,0,0,1,0,1, 0,0,1,0,0,1,0,1,0,0,1,0,0,1,0,1],
      },
    }
  },

  reggaeton: {
    label: 'Reggaetón',
    patterns: {
      // ✓ = validated in session against real reference
      'Dembow clásico ✓': {
        bpm: 95,
        desc: 'The DNA of reggaetón. Kick on all four beats, clap on the "a" of every beat (last sixteenth of each quarter). That asymmetric placement creates the trot.',
        dna: [{ label: 'parent', text: 'dancehall Dem Bow' }, { label: 'origin', text: 'Puerto Rico 90s' }],
        kick:   [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0, 1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
        snare:  [0,0,0,1,0,0,1,0,0,0,0,1,0,0,1,0, 0,0,0,1,0,0,1,0,0,0,0,1,0,0,1,0],
        hihat:  [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0, 1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
        hhOpen: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      },
      'Dembow + snare': {
        bpm: 95,
        desc: 'Dembow base with an added snare hit on beat 3. Extra punch at the midpoint. Common in Luny Tunes productions.',
        dna: [{ label: 'base', text: 'dembow clásico' }],
        kick:   [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0, 1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
        snare:  [0,0,0,1,0,0,1,0,1,0,0,1,0,0,1,0, 0,0,0,1,0,0,1,0,1,0,0,1,0,0,1,0],
        hihat:  [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0, 1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
        hhOpen: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      },
    }
  },

  ska: {
    label: 'Ska',
    patterns: {
      'Ska classic': {
        bpm: 170,
        desc: 'Fast tempo, snare on 2 and 4, continuous hi-hat. The offbeat guitar stab (skank) is the defining element — program it in the chord grid.',
        dna: [{ label: 'era', text: 'Jamaica 1960s' }, { label: 'evolved into', text: 'rocksteady → reggae' }],
        kick:   [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0, 1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
        snare:  [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0, 0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
        hihat:  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1, 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        hhOpen: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      },
    }
  },

  rocksteady: {
    label: 'Rocksteady',
    patterns: {
      'Rocksteady basic': {
        bpm: 76,
        desc: 'Kick on 1 and 3, snare on 2 and 4. Slower than ska, more soulful. The bridge between ska and reggae.',
        dna: [{ label: 'parent', text: 'ska' }, { label: 'child', text: 'reggae' }],
        kick:   [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0, 1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
        snare:  [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0, 0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
        hihat:  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1, 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        hhOpen: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      },
    }
  },
};
```

### Implementation notes

- The existing drum grid has 4 lanes: `kick`, `snare`, `hihat`, `hhOpen`. Map preset keys to those exact lane IDs.
- BPM update should use the same increment/decrement logic already in place — just set the internal BPM value and re-render the display.
- Panel open/close state is a simple boolean — no animation required.
- Do not add a dependency for UI. Plain DOM manipulation only.

---

## Feature 2 — Beat labels above the drum grid

Add a read-only row of labels above the drum grid showing subdivisions:

```
1  e  +  a  2  e  +  a  3  e  +  a  4  e  +  a  1  e  +  a  2  e  +  a  3  e  +  a  4  e  +  a
```

- 32 labels total (2 bars × 4 beats × 4 subdivisions)
- Beat numbers (`1`, `2`, `3`, `4`) in a slightly bolder/darker style
- `e`, `+`, `a` in a muted color
- Must align pixel-perfectly with the drum grid cells
- No interactivity — labels are static

---

## Feature 3 — Ghost notes (ternary cell state)

Change drum grid cells from binary (off/on) to ternary (off / hit / ghost).

**State cycle on click:** `off → hit → ghost → off`

**Visual encoding:**
- `off` — empty cell (current default)
- `hit` — full color (current active state)
- `ghost` — lighter tint of the same color (≈40% opacity or a lighter shade)

**Audio encoding:**
- `hit` — full velocity (current behavior)
- `ghost` — reduced volume, approximately 25–30% of full velocity

**Storage:** change the per-cell value from `boolean` / `0|1` to `0 | 1 | 0.5`. The scheduler checks: if `>= 1` play full velocity, if `> 0` play ghost velocity.

**No other changes to the chord grid** — ghost notes only apply to the drum lanes.

---

## Feature 4 — Shareable URL with preset state

Extend the existing roadmap v3 URL format to include drum preset identity.

Add two optional URL params:
- `dp_genre` — the genre key (e.g. `reggae`)
- `dp_preset` — the preset name (e.g. `One+drop`)

When loading from a URL that includes these params, highlight the corresponding preset button as active in the panel (even if the user has since edited the grid).

All other state (chord grid, scenes, BPM, volumes) follows the existing compression scheme from the roadmap.

---

## Implementation order

1. **Feature 2** (beat labels) — lowest effort, highest pedagogical value, zero risk
2. **Feature 1** (drum preset browser) — core feature, self-contained, no refactor needed
3. **Feature 3** (ghost notes) — requires changing cell state model, test carefully
4. **Feature 4** (shareable URL) — builds on all of the above

---

## Validated presets

The following patterns were tested against real audio references during the design session and confirmed to sound correct:

- `reggaeton / Dembow clásico ✓` — validated

All other presets are musically researched but not yet validated against live recordings. Mark them as such in the UI if desired (e.g. a subtle "beta" label on the preset button).

---

## Out of scope for v2

- No new audio synthesis engines
- No sample loading or file I/O
- No additional chord grid presets (planned for v3)
- No framework migration — stays vanilla JS in a single HTML file
- No reggaetón subgenre presets (trap latino, moombahton, champeta) until validated with specialist producers

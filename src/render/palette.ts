// Render palette (§4/§11.1/D35). The well/HUD band is a DIMMED, desaturated
// shade of the level's band color; enemies keep fixed full-brightness
// per-type colors (Task 8.3) so a same-hue overlap still reads clearly.
// Exact hex values are the implementer's choice (§11.1) — distinctness and
// the dimmed-band rule are what the §15 visual checklist verifies.

// §4 band order: blue, red, yellow, cyan, green, magenta.
const BAND_HUES = [225, 0, 55, 185, 130, 300] as const;

export interface BandColors {
  well: string; // dimmed, desaturated well/HUD strokes
  highlight: string; // the player-lane sector cue (bright)
  text: string; // HUD text in the band color family
}

function band(hue: number): BandColors {
  return {
    well: `hsl(${hue} 45% 40%)`,
    highlight: `hsl(${hue} 100% 72%)`,
    text: `hsl(${hue} 90% 70%)`,
  };
}

const BANDS: readonly BandColors[] = BAND_HUES.map(band);

export function bandColors(paletteIndex: number): BandColors {
  return BANDS[paletteIndex % BANDS.length]!;
}

export const CLAW_COLOR = '#ffe14d'; // the classic yellow claw cursor

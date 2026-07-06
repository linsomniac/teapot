// Swept 1-D collision (§6.7): same-lane overlap of two [prev, curr] depth
// spans, each inflated by a half-extent. Sweeping the whole tick's travel
// (not point-sampling curr) means fast opposing shots can never tunnel
// through each other between ticks.

export function sweptOverlap(
  prevA: number,
  currA: number,
  extA: number,
  prevB: number,
  currB: number,
  extB: number,
): boolean {
  const loA = Math.min(prevA, currA) - extA;
  const hiA = Math.max(prevA, currA) + extA;
  const loB = Math.min(prevB, currB) - extB;
  const hiB = Math.max(prevB, currB) + extB;
  return loA <= hiB && loB <= hiA; // inclusive at the boundary
}

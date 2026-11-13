/**
 * Deep-copies mission state.
 *
 * `structuredClone` is the right call and is what runs everywhere current
 * (Chrome 98+, Safari 15.4+, Firefox 94+), but a hackathon is demonstrated on
 * whatever laptop is wired to the projector. MissionState is plain JSON — only
 * numbers, strings, booleans, arrays and object literals, no Dates, Maps or
 * typed arrays — so the JSON round-trip is an exact substitute rather than an
 * approximation, and it costs one feature test at module load.
 *
 * No React, no three, no store, no Math.random, no Date.now: this file obeys
 * the same rules as the rest of src/sim.
 */
const hasStructuredClone = typeof structuredClone === 'function'

export function cloneState<T>(value: T): T {
  return hasStructuredClone
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T)
}

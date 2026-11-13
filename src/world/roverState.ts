import { structureById } from '../data/structures'

/**
 * Where the rover physically is.
 *
 * Deliberately a plain mutable object rather than a store: the rover's
 * transform changes every frame while it is being driven, and pushing that
 * through zustand would re-render the HUD at frame rate for no benefit. The
 * UI only ever needs the derived facts — charge, whether you are near it —
 * and those do go through the stores.
 *
 * It also outlives both controllers, which is the point: park the rover at
 * the far side of the bowl, get out, and it is still there.
 */
const dock = structureById('rover')

export const rover = {
  x: dock?.pos[0] ?? 21,
  z: dock?.pos[2] ?? 6,
  /** Facing, radians, in the same convention as the walker's yaw. */
  heading: dock?.rot ?? 0,
  /** Wheel spin, for the animation. */
  spin: 0,
}

/** Puts the rover back on its pad. Used when a mission starts or restarts. */
export function resetRover(): void {
  rover.x = dock?.pos[0] ?? 21
  rover.z = dock?.pos[2] ?? 6
  rover.heading = dock?.rot ?? 0
  rover.spin = 0
}

/**
 * A position the astronaut controller should jump to on its next frame.
 *
 * Climbing out of the rover 60 m from the habitat has to put you beside the
 * rover, not back where you left your footprints. The two controllers never
 * run in the same frame, so a one-shot handoff is enough and avoids giving
 * either of them a reference to the other.
 */
export const handoff: { to: [number, number] | null } = { to: null }

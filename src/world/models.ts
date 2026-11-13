/**
 * THE MODEL MANIFEST
 * ==================
 *
 * Which ready-made .glb files this build has, and how to place them.
 *
 * Empty by default: the trainer ships with procedural geometry for
 * everything, so it clones small and runs anywhere. Add an entry here and
 * drop the file in `public/models/` and that object switches over — see the
 * header of `ModelSlot.tsx` for where to get NASA's models and what to watch
 * out for.
 *
 * This file is data, and it is deliberately the only thing that has to change
 * to adopt a model. No component mentions a filename.
 */

export type ModelSlotId =
  | 'rover' | 'habitat' | 'solarArray' | 'reactor' | 'greenhouse' | 'lander'

export interface ModelDef {
  /** Filename inside public/models/ */
  file: string
  /** Uniform scale applied after loading. Most published models are in metres. */
  scale?: number
  /** Yaw in radians, to bring the model's forward axis onto this scene's. */
  yaw?: number
  /** Vertical offset, metres, if the model's origin is not at its base. */
  lift?: number
  /** Where it came from and under what terms. Kept so attribution is not lost. */
  credit?: string
}

export const MODELS: Partial<Record<ModelSlotId, ModelDef>> = {
  // Example of a filled slot — uncomment once the file is actually present:
  //
  // rover: {
  //   file: 'curiosity.glb',
  //   scale: 1.0,
  //   yaw: Math.PI / 2,
  //   credit: 'NASA 3D Resources, public domain',
  // },
}

import { create } from 'zustand'

/**
 * Separate from the mission store on purpose. Focus and hold progress change
 * many times a second; keeping them out of the mission store means the HUD and
 * planning screens are not re-rendered by camera-rate updates.
 */
interface FieldState {
  focusedId: string | null
  holdProgress: number
  pointerLocked: boolean
  setFocus: (id: string | null) => void
  setHold: (v: number) => void
  setPointerLocked: (v: boolean) => void
}

export const useField = create<FieldState>((set) => ({
  focusedId: null,
  holdProgress: 0,
  pointerLocked: false,
  setFocus: (id) => set((s) => (s.focusedId === id ? s : { focusedId: id, holdProgress: 0 })),
  setHold: (v) => set({ holdProgress: v }),
  setPointerLocked: (v) => set({ pointerLocked: v }),
}))

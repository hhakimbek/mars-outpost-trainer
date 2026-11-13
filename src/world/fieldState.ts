import { create } from 'zustand'

/**
 * Separate from the mission store on purpose. Focus and hold progress change
 * many times a second; keeping them out of the mission store means the HUD and
 * planning screens are not re-rendered by camera-rate updates.
 */
interface FieldState {
  focusedId: string | null
  /**
   * The interior station the walker is standing at, or null.
   *
   * Kept separate from `focusedId` rather than reusing it: the two live in
   * different scenes and are never both meaningful, and sharing one field
   * meant a stale surface structure could be prompted indoors.
   */
  stationId: string | null
  /** The interior room the walker is in, for the HUD's room chip. */
  roomId: string | null
  holdProgress: number
  pointerLocked: boolean
  setFocus: (id: string | null) => void
  setStation: (id: string | null) => void
  setRoom: (id: string | null) => void
  setHold: (v: number) => void
  setPointerLocked: (v: boolean) => void
}

export const useField = create<FieldState>((set) => ({
  focusedId: null,
  stationId: null,
  roomId: null,
  holdProgress: 0,
  pointerLocked: false,
  setFocus: (id) => set((s) => (s.focusedId === id ? s : { focusedId: id, holdProgress: 0 })),
  setStation: (id) => set((s) => (s.stationId === id ? s : { stationId: id, holdProgress: 0 })),
  setRoom: (id) => set((s) => (s.roomId === id ? s : { roomId: id })),
  setHold: (v) => set({ holdProgress: v }),
  setPointerLocked: (v) => set({ pointerLocked: v }),
}))

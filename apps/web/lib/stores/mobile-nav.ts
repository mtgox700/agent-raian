/**
 * Mobile navigation drawer state.
 *
 * Used by Sidebar (subscribes) and Topbar's hamburger button (controls).
 * Only relevant on viewports < md (768px). Desktop ignores it entirely.
 */

import { create } from 'zustand'

interface MobileNavState {
  open:   boolean
  open_:  () => void
  close:  () => void
  toggle: () => void
}

export const useMobileNav = create<MobileNavState>((set) => ({
  open:   false,
  open_:  ()   => set({ open: true }),
  close:  ()   => set({ open: false }),
  toggle: ()   => set((s) => ({ open: !s.open })),
}))

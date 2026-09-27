import { create } from "zustand";

export type QuickAddKind = "task" | "mistake" | "exam" | "revision" | "lesson";

interface UiState {
  focusMode: boolean;
  thoughtOpen: boolean;
  mobileNavOpen: boolean;
  quickAdd: { kind: QuickAddKind; defaults?: Record<string, unknown> } | null;
}

export const useUi = create<UiState>(() => ({
  focusMode: false,
  thoughtOpen: false,
  mobileNavOpen: false,
  quickAdd: null,
}));

export const ui = {
  setFocusMode(on: boolean) {
    useUi.setState({ focusMode: on });
    if (typeof document === "undefined") return;
    if (!on && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  },
  toggleFocusMode() {
    ui.setFocusMode(!useUi.getState().focusMode);
  },
  openThought: () => useUi.setState({ thoughtOpen: true }),
  closeThought: () => useUi.setState({ thoughtOpen: false }),
  quickAdd: (kind: QuickAddKind, defaults?: Record<string, unknown>) => useUi.setState({ quickAdd: { kind, defaults } }),
  closeQuickAdd: () => useUi.setState({ quickAdd: null }),
  setMobileNav: (open: boolean) => useUi.setState({ mobileNavOpen: open }),
};

export async function enterFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
  } catch {
    /* not allowed / unsupported — focus mode still works without it */
  }
}

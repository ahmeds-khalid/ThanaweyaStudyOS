import { create } from "zustand";

export interface ConfirmRequest {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Require typing this word to confirm (for very destructive actions). */
  typeToConfirm?: string;
}

interface ConfirmState {
  /** The most recent request. It is kept after closing so the dialog's text doesn't change while it fades out. */
  request: (ConfirmRequest & { resolve: (ok: boolean) => void }) | null;
  open: boolean;
  ask: (r: ConfirmRequest) => Promise<boolean>;
  close: (ok: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  open: false,
  ask: (r) =>
    new Promise<boolean>((resolve) => {
      if (get().open) get().request?.resolve(false);
      set({ request: { ...r, resolve }, open: true });
    }),
  close: (ok) => {
    get().request?.resolve(ok);
    set({ open: false });
  },
}));

/** Ask the user to confirm; resolves to true only on explicit confirmation. */
export const confirmAction = (r: ConfirmRequest) => useConfirmStore.getState().ask(r);

import { toast as sonner } from "sonner";

/**
 * App-wide notifications, shown by shadcn's Sonner toaster (mounted once in the
 * app shell). The call signatures are the same ones the pages have always used.
 */
export const toast = {
  show: (title: string, description?: string) => sonner(title, { description, duration: 4000 }),
  success: (title: string, description?: string) => sonner.success(title, { description, duration: 4000 }),
  error: (title: string, description?: string) => sonner.error(title, { description, duration: 8000 }),
  warning: (title: string, description?: string) => sonner.warning(title, { description, duration: 6000 }),
  /** A message with a button (used for Undo). */
  withAction: (title: string, action: { label: string; onClick: () => void } | undefined, description?: string) =>
    sonner(title, { description, duration: 7000, action: action ? { label: action.label, onClick: action.onClick } : undefined }),
};

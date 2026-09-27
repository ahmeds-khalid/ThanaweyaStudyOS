"use client";

import { toast } from "../store/toast";

export type PermissionState = "granted" | "denied" | "default" | "unsupported";

export function notificationPermission(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  if (notificationPermission() === "unsupported") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return notificationPermission();
  }
}

/**
 * Show a browser notification when enabled and permitted; otherwise fall back
 * to an in-app toast so the message is never lost.
 */
export async function notify(title: string, body: string, opts: { browser: boolean; tag?: string; toastFallback?: boolean } = { browser: true }) {
  const canBrowser = opts.browser && notificationPermission() === "granted";
  if (canBrowser) {
    try {
      const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
      if (reg) {
        await reg.showNotification(title, { body, tag: opts.tag, icon: "/pwa-icon/192", badge: "/pwa-icon/192" });
      } else {
        new Notification(title, { body, tag: opts.tag, icon: "/pwa-icon/192" });
      }
      if (document.visibilityState === "visible" && opts.toastFallback !== false) toast.show(title, body);
      return;
    } catch {
      /* fall through to toast */
    }
  }
  if (opts.toastFallback !== false) toast.show(title, body);
}

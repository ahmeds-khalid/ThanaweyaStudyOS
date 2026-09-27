"use client";

import { useState } from "react";
import { Button } from "@/components/app/button";
import { Dialog } from "@/components/app/dialog";
import { Input, Textarea } from "@/components/app/form";
import { useT } from "@/lib/i18n";
import { useConfirmStore } from "@/lib/store/confirm";
import { db } from "@/lib/store/data";
import { useFocus } from "@/lib/store/focus";
import { ui, useUi } from "@/lib/store/ui";

/* ------------------------------------------------------------------ */
/* Confirm                                                              */
/* ------------------------------------------------------------------ */

export function ConfirmDialog() {
  const request = useConfirmStore((s) => s.request);
  const open = useConfirmStore((s) => s.open);
  const close = useConfirmStore((s) => s.close);
  const [typed, setTyped] = useState("");
  const needsTyping = !!request?.typeToConfirm;
  const canConfirm = !needsTyping || typed.trim().toLowerCase() === request?.typeToConfirm?.toLowerCase();
  const onClose = (ok: boolean) => {
    setTyped("");
    close(ok);
  };
  return (
    <Dialog
      open={open}
      onClose={() => onClose(false)}
      size="sm"
      title={request?.title ?? ""}
      description={request?.description}
      footer={
        <>
          <Button onClick={() => onClose(false)}>{request?.cancelLabel ?? "Cancel"}</Button>
          <Button variant={request?.destructive ? "danger" : "primary"} disabled={!canConfirm} onClick={() => onClose(true)} autoFocus={!needsTyping}>
            {request?.confirmLabel ?? "Confirm"}
          </Button>
        </>
      }
    >
      {needsTyping ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="confirm-type" className="text-[13px] text-muted-foreground">
            Type <span className="font-mono font-semibold text-foreground">{request?.typeToConfirm}</span> to confirm.
          </label>
          <Input id="confirm-type" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" />
        </div>
      ) : request?.destructive ? (
        <p className="text-[13px] text-muted-foreground">This can be undone only where an Undo option is shown.</p>
      ) : null}
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Thought parking                                                      */
/* ------------------------------------------------------------------ */

export function ThoughtCapture() {
  const open = useUi((s) => s.thoughtOpen);
  const t = useT();
  const sessionId = useFocus((s) => s.session?.sessionId ?? null);
  const [text, setText] = useState("");
  const save = () => {
    const value = text.trim();
    if (!value) return;
    db.create("thoughts", { text: value, sessionId });
    setText("");
    ui.closeThought();
  };
  return (
    <Dialog
      open={open}
      onClose={ui.closeThought}
      size="sm"
      title={t("focus.captureThought")}
      description="Park it here and get back to studying. You'll see it after the session."
      footer={
        <>
          <Button onClick={ui.closeThought}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={save} disabled={!text.trim()}>
            Park thought
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label htmlFor="thought-text" className="sr-only">
          {t("focus.whatCameToMind")}
        </label>
        <Textarea
          id="thought-text"
          autoFocus
          rows={3}
          placeholder={t("focus.whatCameToMind")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              save();
            }
          }}
        />
        <p className="mt-2 text-xs text-muted-foreground">Enter to save · Shift+Enter for a new line</p>
      </form>
    </Dialog>
  );
}

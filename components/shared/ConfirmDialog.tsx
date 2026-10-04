"use client";

import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Shared existing app-dialog appearance and confirmation behavior. */
export default function ConfirmDialog({ title, body, eyebrow, ariaLabel, cancelLabel, confirmLabel, onCancel, onConfirm }: {
  title: string; body: ReactNode; eyebrow?: string; ariaLabel?: string; cancelLabel: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void;
}) {
  const titleId = useId(), bodyId = useId();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); onCancel(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);
  return createPortal(
    <div className="app-dialog-backdrop" onClick={event => { if (event.target === event.currentTarget) onCancel(); }}>
      <div role="alertdialog" aria-modal="true" aria-label={ariaLabel} aria-labelledby={ariaLabel ? undefined : titleId} aria-describedby={bodyId} className="app-dialog">
        {eyebrow && <div className="app-dialog-eyebrow">{eyebrow}</div>}
        <h2 id={titleId}>{title}</h2>
        <p id={bodyId}>{body}</p>
        <div className="user-note-dialog-actions">
          <button type="button" className="user-note-dialog-cancel" onClick={onCancel} autoFocus>{cancelLabel}</button>
          <button type="button" className="app-dialog-confirm" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>, document.body,
  );
}

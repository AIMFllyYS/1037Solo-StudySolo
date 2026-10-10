"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useOverlayRegistration } from "@/lib/keyboard/useOverlayRegistration";

export default function InputLimitDialog({ count, limit, onClose }: { count: number; limit: number; onClose: () => void }) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dismiss = useCallback(() => onClose(), [onClose]);
  useOverlayRegistration({ id: `input-limit-${id}`, open: true, onClose: dismiss, priority: 90 });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    buttonRef.current?.focus();
    return () => previous?.focus();
  }, []);
  return createPortal(<div className="app-dialog-backdrop">
    <div role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} className="app-dialog"
      onKeyDown={(event) => {
        if (event.key === "Tab") { event.preventDefault(); buttonRef.current?.focus(); }
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      }}>
      <div className="app-dialog-eyebrow">输入字数提醒</div>
      <h2 id={`${id}-title`}>已超出 5 万字上限</h2>
      <p id={`${id}-body`}>当前输入 {count.toLocaleString("en-US")} 字，最多支持 {limit.toLocaleString("en-US")} 字。
        请删减 {Math.max(0, count - limit).toLocaleString("en-US")} 字后再发送。原文已保留在输入框中，不会自动截断。</p>
      <button ref={buttonRef} type="button" className="app-dialog-confirm" onClick={onClose}>返回修改</button>
    </div>
  </div>, document.body);
}

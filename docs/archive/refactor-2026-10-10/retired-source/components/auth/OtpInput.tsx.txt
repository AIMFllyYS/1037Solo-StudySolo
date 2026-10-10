"use client";

import { useEffect, useRef } from "react";

/**
 * 6 位分格验证码输入：自动前进、退格回退、粘贴分发、方向键移动。
 * 语义契约：第一格 aria-label="验证码"（既有测试 getByLabelText("验证码") 可直达），
 * user.type 逐位触发 onChange，与单输入框行为兼容。
 */
export default function OtpInput({
  value,
  onChange,
  length = 6,
}: {
  value: string;
  onChange: (next: string) => void;
  length?: number;
}) {
  const cellsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    cellsRef.current[0]?.focus();
  }, []);

  function focusCell(index: number) {
    const clamped = Math.max(0, Math.min(length - 1, index));
    cellsRef.current[clamped]?.focus();
  }

  function commit(next: string, caret: number) {
    onChange(next);
    focusCell(caret);
  }

  function handleCellInput(index: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      // 输入被清空（如选中后删除）：同步移除该位
      const chars = value.split("");
      chars.splice(index, 1);
      commit(chars.join(""), index);
      return;
    }
    const chars = value.padEnd(length, " ").split("");
    for (let i = 0; i < digits.length && index + i < length; i += 1) {
      chars[index + i] = digits[i]!;
    }
    commit(chars.join("").trimEnd(), index + digits.length);
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      const chars = value.split("");
      if (chars[index]) {
        chars.splice(index, 1);
        commit(chars.join(""), index);
        return;
      }
      if (index > 0) {
        chars.splice(index - 1, 1);
        commit(chars.join(""), index - 1);
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusCell(index - 1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusCell(index + 1);
    }
  }

  function handlePaste(index: number, event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const digits = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!digits) return;
    commit(digits.slice(0, length), Math.min(index + digits.length, length - 1));
  }

  return (
    <div className="auth-otp">
      {Array.from({ length }).map((_, index) => {
        const ch = value[index] ?? "";
        return (
          <input
            key={index}
            ref={(node) => {
              cellsRef.current[index] = node;
            }}
            className="auth-otp-cell"
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            aria-label={index === 0 ? "验证码" : `验证码第 ${index + 1} 位`}
            maxLength={length}
            value={ch}
            onChange={(event) => handleCellInput(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={(event) => handlePaste(index, event)}
            onFocus={(event) => event.target.select()}
          />
        );
      })}
    </div>
  );
}

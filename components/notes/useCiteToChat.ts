"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChatUI } from "@/lib/stores/chat/chatUI";

/** 「引用到对话」：写进聊天输入框的引用区，并给按钮一个短暂的「已引用」反馈。 */
export function useCiteToChat(): { cited: boolean; cite: (text: string) => void } {
  const [cited, setCited] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const cite = useCallback((text: string) => {
    useChatUI.getState().setQuotedText(text);
    setCited(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCited(false), 2000);
  }, []);

  return { cited, cite };
}

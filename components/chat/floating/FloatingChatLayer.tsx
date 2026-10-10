"use client";

import { useFloatingChats } from "@/lib/hooks/useFloatingChats";
import FloatingChatWindow from "@/components/chat/floating/FloatingChatWindow";

/** 渲染所有划词追问浮窗（多开、互不影响）。挂载一次即可。 */
export default function FloatingChatLayer() {
  const windows = useFloatingChats((s) => s.windows);
  return (
    <>
      {windows.map((w) => (
        <FloatingChatWindow key={w.id} win={w} />
      ))}
    </>
  );
}

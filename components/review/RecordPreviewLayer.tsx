"use client";

import { useRecordPreviews } from "@/lib/stores/learning/recordPreviews";
import RecordPreviewWindow from "@/components/review/RecordPreviewWindow";

// 渲染所有打开的「记录」预览浮窗。与 FloatingChatLayer 并列挂在 AppShell（桌面+移动）。
export default function RecordPreviewLayer() {
  const previews = useRecordPreviews((s) => s.previews);
  return (
    <>
      {previews.map((p) => (
        <RecordPreviewWindow key={p.id} preview={p} />
      ))}
    </>
  );
}

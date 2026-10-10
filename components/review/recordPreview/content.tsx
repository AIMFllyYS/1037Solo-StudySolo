import { BrainCircuit, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

import { useProcessingDisclosure } from "@/lib/hooks/chat/useProcessingDisclosure";
import AnimatedCollapse from "@/components/ui/AnimatedCollapse";

import CollapsibleSection from "@/components/review/CollapsibleSection";
import QuizMarkdown from "@/components/quiz/QuizMarkdown";

import { BOX } from "./appearance";
/** 原文富文本区（始终默认展开，可手动折叠）。 */
export function OriginalRichText({ text }: { text: string }) {
  return (
    <CollapsibleSection label="原文" meta={`${text.length} 字`} defaultOpen>
      <div
        className="scroll-y chat-prose"
        style={{
          maxHeight: 220, overflowY: "auto",
          padding: "10px 12px",
          fontSize: 13, lineHeight: 1.6,
          background: BOX.bg, borderRadius: BOX.radius,
          border: BOX.border,
        }}
      >
        <QuizMarkdown className="chat-prose">{text}</QuizMarkdown>
      </div>
    </CollapsibleSection>
  );
}

/** 思考折叠面板（流式 reasoning）。 */
export function ThinkingPanel({ content, isProcessing }: { content: string; isProcessing: boolean }) {
  const [isExpanded, setIsExpanded] = useProcessingDisclosure(isProcessing);
  if (!content || content.trim() === "") return null;
  const lines = content.split("\n");
  const preview = lines.slice(0, 2).join("\n").slice(0, 120);

  return (
    <div style={{
      borderRadius: BOX.radius,
      background: BOX.bg,
      border: BOX.border,
      overflow: "hidden",
    }}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
        data-no-drag
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", border: "none", background: "transparent", cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <BrainCircuit size={14} style={{ color: "var(--md-sys-color-primary)" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--md-sys-color-primary)" }}>思考过程</span>
          {isProcessing && <Loader2 size={12} className="animate-spin" style={{ color: "var(--md-sys-color-primary)" }} />}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, color: "var(--md-sys-color-on-surface-variant)" }}>
            {isExpanded ? "收起" : "展开"}
          </span>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>
      <AnimatedCollapse isOpen={isExpanded}>
        <div
          className="scroll-y chat-prose"
          style={{
            padding: "8px 12px 12px", borderTop: BOX.border,
            fontSize: 12, lineHeight: 1.6, color: "var(--md-sys-color-on-surface-variant)",
            maxHeight: 200, overflowY: "auto", wordBreak: "break-word",
          }}
        >
          <QuizMarkdown className="chat-prose">{content}</QuizMarkdown>
        </div>
      </AnimatedCollapse>
      <AnimatedCollapse isOpen={!isExpanded}>
        <div style={{ padding: "6px 12px", borderTop: BOX.border, fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", lineHeight: 1.5 }}>
          {preview}{content.length > 120 ? "..." : ""}
        </div>
      </AnimatedCollapse>
    </div>
  );
}
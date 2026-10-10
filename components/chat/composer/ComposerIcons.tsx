import type { CSSProperties, ReactElement, ReactNode } from "react";
import type { ForcedComposerTool } from "@/lib/chat/composerIntent";
import { ContextUsageRing } from "@/components/chat/billing/ContextUsageRing";
import { useTokenTracker } from "@/lib/hooks/useTokenTracker";

/** 与顶栏最小化窗同一套缩略图：方圆角、细边框、底栏色条。 */
const THUMB_ACCENTS = {
  plan: "#7c3aed",
  compact: "#0ea5e9",
  generateImage: "#e11d48",
  renderInteractive: "#0d9488",
  writeDocument: "#d97706",
  flashcards: "#ea580c",
  notes: "#16a34a",
} as const;

function ComposerThumb({
  name,
  accent,
  children,
}: {
  name: string;
  accent?: string;
  children?: ReactNode;
}) {
  return (
    <span
      data-composer-icon={name}
      data-composer-thumb="square"
      className="composer-tool-thumb"
      style={accent ? ({ "--composer-thumb-accent": accent } as CSSProperties) : undefined}
      aria-hidden
    >
      {children}
      {accent ? <span className="composer-tool-thumb-bar" /> : null}
    </span>
  );
}

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function PlanModeIcon() {
  return (
    <ComposerThumb name="plan" accent={THUMB_ACCENTS.plan}>
      <Glyph>
        <circle cx="3.6" cy="4" r="1.15" />
        <circle cx="3.6" cy="8" r="1.15" />
        <circle cx="3.6" cy="12" r="1.15" />
        <path d="M6.3 4h6.2M6.3 8h6.2M6.3 12h4.1" />
      </Glyph>
    </ComposerThumb>
  );
}

/** 加号 / 斜杠「压缩上下文」：复用上下文窗口百分比圆环。 */
export function CompactContextIcon() {
  const ctxTokens = useTokenTracker((s) => s.currentContextTokens);
  const ctxLimit = useTokenTracker((s) => s.modelContextLimit);
  const ratio = ctxLimit > 0 ? ctxTokens / ctxLimit : 0;
  return (
    <ComposerThumb name="compact" accent={THUMB_ACCENTS.compact}>
      <ContextUsageRing ratio={ratio} size={12} />
    </ComposerThumb>
  );
}

export function GenerateImageToolIcon() {
  return (
    <ComposerThumb name="generateImage" accent={THUMB_ACCENTS.generateImage}>
      <Glyph>
        <rect x="2.2" y="3.1" width="11.6" height="9.8" rx="1.6" />
        <circle cx="10.7" cy="6.3" r="1.15" />
        <path d="m2.7 10.5 3.3-3.1 2.9 2.8 1.8-1.6 2.6 2.3" />
      </Glyph>
    </ComposerThumb>
  );
}

export function InteractiveHtmlToolIcon() {
  return (
    <ComposerThumb name="renderInteractive" accent={THUMB_ACCENTS.renderInteractive}>
      <Glyph>
        <path d="m5.3 4.4-3.1 3.6 3.1 3.6M10.7 4.4l3.1 3.6-3.1 3.6" />
        <path d="M9.2 4.6 6.8 11.4" />
      </Glyph>
    </ComposerThumb>
  );
}

export function LongArticleToolIcon() {
  return (
    <ComposerThumb name="writeDocument" accent={THUMB_ACCENTS.writeDocument}>
      <Glyph>
        <path d="M4.1 2.4h5.1L12 5.2v8.4H4.1z" />
        <path d="M9.1 2.4V5.2H12" />
        <path d="M6.1 7.3h3.8M6.1 9.2h3.8M6.1 11.1h2.4" />
      </Glyph>
    </ComposerThumb>
  );
}

export function FlashcardToolIcon() {
  return (
    <ComposerThumb name="flashcards" accent={THUMB_ACCENTS.flashcards}>
      <Glyph>
        <rect x="4.1" y="2.6" width="8.4" height="6.7" rx="1.2" />
        <path d="M3.3 5.8v5.2c0 .8.6 1.4 1.4 1.4h7.1" />
      </Glyph>
    </ComposerThumb>
  );
}

export function NotesToolIcon() {
  return (
    <ComposerThumb name="notes" accent={THUMB_ACCENTS.notes}>
      <Glyph>
        <rect x="3.2" y="2.4" width="9.6" height="11.2" rx="1.1" />
        <path d="M6.1 2.4v11.2M7.8 6.3h3M7.8 8.7h2.1" />
      </Glyph>
    </ComposerThumb>
  );
}

/** Skills 不画字形，只留统一小方块，和工具行列对齐。 */
export function SkillIcon() {
  return <ComposerThumb name="skill" />;
}

const TOOL_ICONS: Record<ForcedComposerTool, () => ReactElement> = {
  generateImage: GenerateImageToolIcon,
  renderInteractive: InteractiveHtmlToolIcon,
  writeDocument: LongArticleToolIcon,
  flashcards: FlashcardToolIcon,
  notes: NotesToolIcon,
};

export function ForcedToolIcon({ tool }: { tool: ForcedComposerTool }) {
  const Icon = TOOL_ICONS[tool];
  return <Icon />;
}

"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Crepe } from "@milkdown/crepe";
import "katex/contrib/mhchem";
import { keepEditorShortcut } from "@/lib/notes/editorShortcuts";
import { guardListEnterKeydown, type GuardEditorView, type GuardKeyEvent } from "@/lib/notes/milkdownListGuards";
import { translateNow, useT, type Translate } from "@/lib/i18n";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

/**
 * 个人笔记 / 课堂便签的「渲染编辑」层。
 * Markdown 字符串仍是唯一真相源（UserNote.markdown）；Crepe 只是可写的所见即所得视图。
 * compact：只缩小窗体与留白，不阉割公式 / 列表 / 斜杠菜单 / 快捷键。
 *
 * 外部正文更新（确认卡同意写入、云同步回灌）由调用方换 key 重挂来接管，见
 * UserNoteEditorWindow / ClassroomNoteWindow 的 lastEmitted 比对。
 */

/** 划词工具栏里的标题层级。与 lib/notes/noteToc.ts 的 h1–h3 目录保持一致。 */
const HEADING_LEVELS = [1, 2, 3] as const;

/**
 * 工具栏上只有 icon（HTML 字符串，经 DOMPurify 后 innerHTML），没有下拉，
 * 所以标题层级用自绘的 H1/H2/H3/正文按钮表达。
 */
function headingIcon(text: string): string {
  return `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><text x="12" y="17" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">${text}</text></svg>`;
}

/** Crepe 没导出 Ctx 的公开类型；这里只用到两个按名字取的 slice。 */
type CtxLike = { get?: (key: string) => unknown };

function currentNode(ctx: unknown): { name?: string; level?: number } | null {
  const state = (ctx as CtxLike)?.get?.("editorState") as
    | { selection?: { $from?: { parent?: { type?: { name?: string }; attrs?: { level?: number } } } } }
    | undefined;
  const parent = state?.selection?.$from?.parent;
  if (!parent?.type?.name) return null;
  return { name: parent.type.name, level: parent.attrs?.level };
}

/**
 * 用命令名调用 CommonMark 的 WrapInHeading（level<1 回到正文）。
 *
 * 走字符串 slice 名而不是 `import { wrapInHeadingCommand } from "@milkdown/kit/...`：
 * 项目只直接依赖 @milkdown/crepe，装 kit 会引入第二份 @milkdown/core，
 * 两份 core 的 slice 身份不相等，ctx.get 会直接抛 contextNotFound。
 */
function applyHeading(ctx: unknown, level: number): void {
  const commands = (ctx as CtxLike)?.get?.("commands") as
    | { call?: (name: string, payload?: unknown) => void }
    | undefined;
  try {
    commands?.call?.("WrapInHeading", level);
  } catch {
    /* 未来 Crepe 改名时静默降级：按钮不生效，但不会打断编辑 */
  }
}

/** 从编辑器 ctx 里取当前选区文本（跨段落用换行连接）。 */
function selectedText(ctx: unknown): string {
  const state = (ctx as CtxLike)?.get?.("editorState") as
    | {
        selection?: { empty?: boolean; from?: number; to?: number };
        doc?: { textBetween?: (from: number, to: number, sep?: string) => string };
      }
    | undefined;
  const sel = state?.selection;
  if (!sel || sel.empty || typeof sel.from !== "number" || typeof sel.to !== "number") return "";
  return state?.doc?.textBetween?.(sel.from, sel.to, "\n")?.trim() ?? "";
}

/** 划词工具栏「引用」按钮的图标（引号形状，与标题按钮同为内联 SVG 字符串）。 */
const QUOTE_ICON = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>`;

/** Crepe 没从公开入口导出 GroupBuilder / ToolbarItem 类型，这里按结构声明最小形状。 */
interface ToolbarBuilderLike {
  addGroup: (
    key: string,
    label: string,
  ) => {
    addItem: (
      key: string,
      item: { active: (ctx: never) => boolean; icon: string; label?: string; onRun?: (ctx: never) => void },
    ) => void;
  };
}

function buildNoteToolbar(builder: ToolbarBuilderLike, onQuote?: (text: string) => void): void {
  // 工具栏在挂载时一次性建好，拿不到组件的 t：直接按当前语言取词。
  const t: Translate = translateNow;
  const group = builder.addGroup("note-heading", t("window.note.milkdown.headingGroup"));
  for (const level of HEADING_LEVELS) {
    group.addItem(`h${level}`, {
      icon: headingIcon(`H${level}`),
      label: t("window.note.milkdown.headingLevel", { level }),
      active: ((ctx: unknown) => currentNode(ctx)?.level === level) as never,
      onRun: ((ctx: unknown) => applyHeading(ctx, level)) as never,
    });
  }
  group.addItem("paragraph", {
    icon: headingIcon(t("window.note.milkdown.paragraphIcon")),
    label: t("window.note.milkdown.paragraph"),
    active: ((ctx: unknown) => currentNode(ctx)?.name === "paragraph") as never,
    onRun: ((ctx: unknown) => applyHeading(ctx, 0)) as never,
  });
  if (onQuote) {
    const agentGroup = builder.addGroup("note-agent", t("window.note.milkdown.agentGroup"));
    agentGroup.addItem("quote", {
      icon: QUOTE_ICON,
      label: t("menu.selection.quote"),
      active: (() => false) as never,
      onRun: ((ctx: unknown) => {
        const text = selectedText(ctx);
        if (text) onQuote(text);
      }) as never,
    });
  }
}
export default function MilkdownNoteEditor({
  value,
  onChange,
  compact = false,
  onQuote,
  onChangeGuard,
}: {
  value: string;
  onChange: (markdown: string) => void;
  compact?: boolean;
  /** 提供时在划词工具栏追加「引用」按钮，参数为当前选中文本。 */
  onQuote?: (text: string) => void;
  /** Captured when this editor mounts; stale async callbacks must not cross owners. */
  onChangeGuard?: () => boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  const onQuoteRef = useRef(onQuote);
  const onChangeGuardRef = useRef(onChangeGuard);
  // The source-mode fallback belongs to the same editor mount as Crepe. Keep
  // its guard stable if an owner changes before the parent can replace it.
  const fallbackGuardRef = useRef(onChangeGuard);
  const [failed, setFailed] = useState(false);
  const t = useT();

  useEffect(() => {
    onChangeRef.current = onChange;
    onQuoteRef.current = onQuote;
    onChangeGuardRef.current = onChangeGuard;
  }, [onChange, onQuote, onChangeGuard]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    let crepe: Crepe | null = null;
    const editorGuard = onChangeGuardRef.current;

    const boot = async () => {
      try {
        crepe = new Crepe({
          root,
          defaultValue: value,
          features: {
            [Crepe.Feature.ImageBlock]: false,
            [Crepe.Feature.TopBar]: false,
            [Crepe.Feature.AI]: false,
            [Crepe.Feature.Latex]: true,
            [Crepe.Feature.Toolbar]: true,
            [Crepe.Feature.BlockEdit]: true,
          },
          featureConfigs: {
            [Crepe.Feature.Placeholder]: {
              text: compact
                ? t("window.note.milkdown.placeholderCompact")
                : t("window.note.milkdown.placeholderFull"),
              mode: "doc",
            },
            // 划词工具栏出厂只有加粗/斜体/删除线/行内代码/链接，没有标题层级。
            [Crepe.Feature.Toolbar]: {
              buildToolbar: (builder: ToolbarBuilderLike) =>
                buildNoteToolbar(builder, (text) => onQuoteRef.current?.(text)),
            } as never,
          },
        });
        // 列表 Enter 修复挂进 view 直传 props：someProp 顺序里 handleKeyDown 先于
        // 所有 keymap 插件执行，清洗掉 list_item 里的脏块后原生退出链才轮得到。
        // config 回调在 create() 期间、EditorView 构造前执行（ConfigReady < InitReady），
        // 这里 set 的 options 会被展开进 new EditorView 的 props。
        crepe.editor.config((ctx) => {
          try {
            const options = (ctx as CtxLike)?.get?.("editorViewOptions") as
              | { handleKeyDown?: (view: unknown, event: GuardKeyEvent) => boolean }
              | undefined;
            const prev = options?.handleKeyDown;
            (ctx as { set?: (key: string, value: unknown) => void })?.set?.("editorViewOptions", {
              ...options,
              handleKeyDown: (view: unknown, event: GuardKeyEvent) =>
                guardListEnterKeydown(view as GuardEditorView, event) || (prev?.(view, event) ?? false),
            });
          } catch {
            /* ctx 缺 slice 时静默降级：回到原生 Enter 行为，不影响编辑 */
          }
        });
        crepe.on((listener) => {
          listener.markdownUpdated((_ctx, markdown) => {
            if (cancelled || (editorGuard && !editorGuard())) return;
            onChangeRef.current(markdown);
          });
        });
        await crepe.create();
        if (cancelled) {
          await crepe.destroy();
          crepe = null;
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    void boot();
    return () => {
      cancelled = true;
      const instance = crepe;
      crepe = null;
      if (instance) void instance.destroy();
    };
    // 只在挂载时读入当前 Markdown。切回源码再进来会整页重挂，拿到最新正文。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) {
    return (
      <textarea
        data-no-drag
        className="user-note-source"
        value={value}
        spellCheck={false}
        aria-label={t("window.note.common.markdownBody")}
        onChange={(event) => {
          if (fallbackGuardRef.current && !fallbackGuardRef.current()) return;
          onChange(event.target.value);
        }}
        onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => keepEditorShortcut(event)}
      />
    );
  }

  return (
    <div
      ref={rootRef}
      className={compact ? "user-note-crepe is-compact" : "user-note-crepe"}
      data-no-drag
      aria-label={compact ? t("window.note.milkdown.editorAriaCompact") : t("window.note.milkdown.editorAria")}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => keepEditorShortcut(event)}
    />
  );
}

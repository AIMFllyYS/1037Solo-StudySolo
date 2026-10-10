'use client';

import React, { useMemo, Children, isValidElement } from 'react';
import { useStreamingText } from '@/lib/hooks/chat/useStreamingText';
import ReactMarkdown from 'react-markdown';
import { sharedRemarkPlugins, sharedRehypePlugins } from '@/lib/markdown/plugins';
import remarkSoftBreaks from '@/lib/markdown/remarkSoftBreaks';
import { directiveComponents } from '@/components/shared/directives/registry';
import 'katex/dist/katex.min.css';
import { parseXmlTags, hasKnownCustomTags, stripOrphanCustomTagMarkers, CHAT_VIZ_TAGS } from '@/lib/utils/xmlParser';
import { parseChatContent } from '@/lib/chat/rendering/parseChatContent';
import type { ParsedBlock } from '@/lib/types/chat';
import { ChatMessageVisualizations } from '@/components/chat/messages/ChatMessageVisualizations';
import { ToolCallDashboard } from '@/components/chat/trace/ToolCallDashboard';
import CodeBlock from '@/components/shared/CodeBlock';
import { ChatImage } from '@/components/chat/messages/ChatImage';
import { ImageStrip } from '@/components/chat/attachments/ImageStrip';
import { RawSvgViewer } from '@/components/canvas/index';
import { sanitizeSvg } from '@/lib/utils/sanitizeSvg';
import { VizErrorBoundary } from '@/components/chat/messages/VizErrorBoundary';
import { ensureSvgRoot } from '@/lib/canvas/normalize';
import { useT, type Translate } from '@/lib/i18n/index';
import type { CitationSource } from '@/lib/chat/citationCatalog';
import { CitationCatalogContext, CiteRef } from '@/components/chat/sources/InlineCiteMarker';
import remarkInlineCitations from '@/lib/markdown/remarkInlineCitations';

interface MessageContentProps {
  isStreaming?: boolean;
  content: string;
  enableVisualizations?: boolean;
  /** 聊天体文本（用户输入/思考过程/生成依据）启用软换行：段内单 \n 渲染为 <br>。 */
  preserveLineBreaks?: boolean;
  sessionId?: string;
  messageId?: string;
  repairModelId?: string;
  topic?: string;
  /** 本条回答可点的 [n] 来源；没有来源时不启用引用插件，避免把普通 [1] 收成标记。 */
  citations?: CitationSource[];
}

const EMPTY_CITATIONS: CitationSource[] = [];

type MarkdownElementProps<T extends keyof React.JSX.IntrinsicElements> =
  React.ComponentPropsWithoutRef<T> & { node?: unknown };

/**
 * Custom <p> component: when a paragraph contains 2+ images,
 * wrap them in an ImageStrip for horizontal scrolling.
 */
function ChatParagraph({ node: _node, children, ...props }: MarkdownElementProps<'p'>) {
  void _node;
  const childArray = Children.toArray(children);
  const imgChildren = childArray.filter(
    (c) => isValidElement<{ src?: string }>(c) && (c.type === ChatImage || Boolean(c.props.src)),
  );

  if (imgChildren.length >= 2) {
    return <ImageStrip>{children}</ImageStrip>;
  }

  return <p {...props}>{children}</p>;
}

/* ---- Markdown rendering components ----
   排版交由 .chat-prose CSS 统一控制（行距/段距/标题/列表/引用/代码/表格/KaTeX）；
   这里只保留必要的行为：链接新开页、表格横向滚动包裹、代码块复制按钮。 */
const mdComponents = {
  ...directiveComponents,
  // Defense in depth: never mount a script element even if a node slips past sanitize.
  script: () => null,
  img: ChatImage,
  p: ChatParagraph,
  a: ({ node: _node, ...props }: MarkdownElementProps<'a'>) => (
    void _node,
    <a target="_blank" rel="noopener noreferrer" {...props} />
  ),
  table: ({ node: _node, ...props }: MarkdownElementProps<'table'>) => (
    void _node,
    <div className="chat-table-scroll">
      <table {...props} />
    </div>
  ),
  pre: ({ node: _node, className, children }: MarkdownElementProps<'pre'>) => (
    void _node,
    <CodeBlock className={className}>{children}</CodeBlock>
  ),
  'cite-ref': CiteRef,
};

/* ---- Markdown rendering that routes raw inline <svg> to the sanitized viewer ----
   助教有时直接吐裸 <svg>…</svg>（未用 <SvgDiagram> 包裹）。裸 SVG 会落进 markdown 块、
   被 rehype-raw 逐元素交给 React 渲染，而 <text>/<g>/<tspan> 等 SVG 命名空间标签在
   非 <svg> React 上下文下会触发「unrecognized tag」告警（流式半截 SVG 尤甚）。
   这里把完整的 <svg>…</svg> 切出来，经 sanitizeSvg(DOMPurify) 后交给 RawSvgViewer
   以 innerHTML 渲染（浏览器原生处理 SVG 命名空间，零告警）；其余文本仍走 ReactMarkdown。
   此外，助教在思考过程中偶尔输出不带 <svg> 包裹的裸 SVG 子元素（<text>/<line>/…），
   同样会被 rehype-raw 当作 HTML 自定义元素交给 React → unrecognized tag + kebab-case
   属性告警。stripBareSvgChildren 在文本送入 ReactMarkdown 前清除这些孤儿标签。 */
const SVG_BLOCK_RE = /<svg[\s\S]*?<\/svg>/gi;

const SVG_CHILD_TAGS = [
  'text', 'tspan', 'textPath', 'line', 'circle', 'ellipse', 'rect', 'path',
  'polyline', 'polygon', 'g', 'use', 'defs', 'marker', 'stop', 'symbol',
  'linearGradient', 'radialGradient', 'clipPath', 'mask', 'pattern', 'image',
];
const BARE_SVG_CHILD_RE = new RegExp(
  `</?(?:${SVG_CHILD_TAGS.join('|')})\\b[^>]*/?>`,
  'gi',
);
const BARE_SVG_CHILD_BLOCK_RE = new RegExp(
  `<(?:${SVG_CHILD_TAGS.join('|')})\\b[\\s\\S]*>`,
  'i',
);

function stripBareSvgChildren(text: string): string {
  return text.replace(BARE_SVG_CHILD_RE, '');
}

function renderMarkdownWithSvg(
  text: string,
  keyPrefix: string,
  remarkPlugins: typeof sharedRemarkPlugins,
  t: Translate,
): React.ReactNode {
  const content = stripOrphanCustomTagMarkers(text || '');
  const md = (key: string, value: string) => (
    <ReactMarkdown key={key} remarkPlugins={remarkPlugins} rehypePlugins={sharedRehypePlugins} components={mdComponents}>
      {value}
    </ReactMarkdown>
  );

  const trimmed = content.trim();
  if (!content.includes('<svg') && trimmed.startsWith('<') && BARE_SVG_CHILD_BLOCK_RE.test(trimmed)) {
    const rootedSvg = ensureSvgRoot(trimmed);
    return (
      <VizErrorBoundary key={`${keyPrefix}-bare-svg`} label={t("trace.viz.fallbackLabel")} source={trimmed}>
        <RawSvgViewer svg={sanitizeSvg(rootedSvg)} />
      </VizErrorBoundary>
    );
  }

  if (!content.includes('<svg')) return md(keyPrefix, stripBareSvgChildren(content));

  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  SVG_BLOCK_RE.lastIndex = 0;
  while ((m = SVG_BLOCK_RE.exec(content)) !== null) {
    const before = content.slice(last, m.index);
    if (before.trim()) out.push(md(`${keyPrefix}-md-${i}`, stripBareSvgChildren(before)));
    out.push(
      <VizErrorBoundary key={`${keyPrefix}-svg-${i}`} label={t("trace.viz.fallbackLabel")} source={m[0]}>
        <RawSvgViewer svg={sanitizeSvg(m[0])} />
      </VizErrorBoundary>,
    );
    last = m.index + m[0].length;
    i++;
  }
  const tail = content.slice(last);
  if (tail.trim()) out.push(md(`${keyPrefix}-md-${i}`, stripBareSvgChildren(tail)));

  return <React.Fragment key={keyPrefix}>{out}</React.Fragment>;
}

const VIZ_TAG_SET = new Set<string>(CHAT_VIZ_TAGS);

interface MessageRenderContext {
  sessionId?: string;
  messageId?: string;
  repairModelId?: string;
  topic?: string;
  /** 本条消息仍在流式：markdown 块启用「安全空行边界」二级分段（静态消息单段渲染，不建多 processor）。 */
  isStreaming?: boolean;
  /** 文案函数：由 MessageContent 的 useT() 注入，语言切换时错误边界 label 一起重算。 */
  t: Translate;
}

/* SvgDiagram 的 repairContext.blockIndex 是「全文第几个完整 SvgDiagram 标签」的序数：
   replaceCanvasBlock 用同一条正则在原始 content 上定位。分块渲染后没有全文扫一遍的机会，
   就在 map 时按各块源文本累计 —— 流式只增量、序数稳定，计数器不用塞进 renderContext
   （那样 context 每 render 都变，块级 memo 会全部失效）。 */
const SVG_DIAGRAM_TAG_RE = /<SvgDiagram\b[^>]*(?:\/>|>[\s\S]*?<\/SvgDiagram>)/gi;

function countSvgDiagrams(block: ParsedBlock): number {
  if (block.type === 'component' && block.tagName === 'SvgDiagram') return 1;
  const text = `${block.content ?? ''}${block.childrenText ?? ''}`;
  if (!text.includes('<SvgDiagram')) return 0;
  SVG_DIAGRAM_TAG_RE.lastIndex = 0;
  let count = 0;
  while (SVG_DIAGRAM_TAG_RE.exec(text) !== null) count += 1;
  return count;
}

/**
 * 流式 markdown 的安全切点：只认「不在 ``` 围栏 / $$ 数学块 / <svg> 元素内」的 \n\n。
 * 每个已完成段独立 memo，全文生命周期里只解析一次；只有尾段随 tick 重跑管线。
 * 检测是保守的（误判只会少切不会错切）：围栏/数学/ svg 的开关判定不看行首，
 * 行内出现的 ``` 也会当作开关——边界变少但绝不会把未闭合结构切进已完成段。
 */
function streamingMarkdownSegments(text: string): string[] {
  const boundaries: number[] = [];
  const n = text.length;
  let inFence = false;
  let inMath = false;
  let inSvg = false;
  let i = 0;
  while (i < n) {
    if (!inFence && !inMath) {
      if (!inSvg && text.startsWith('<svg', i)) { inSvg = true; i += 4; continue; }
      if (inSvg && text.startsWith('</svg>', i)) { inSvg = false; i += 6; continue; }
    }
    if (inSvg) { i += 1; continue; }
    if (!inMath && text.startsWith('```', i)) { inFence = !inFence; i += 3; continue; }
    if (!inFence && text.startsWith('$$', i)) { inMath = !inMath; i += 2; continue; }
    if (!inFence && !inMath && text.charCodeAt(i) === 10 && text.charCodeAt(i + 1) === 10) {
      boundaries.push(i);
      i += 2;
      continue;
    }
    i += 1;
  }
  if (boundaries.length === 0) return [text];
  const segments: string[] = [];
  let last = 0;
  for (const boundary of boundaries) {
    const chunk = text.slice(last, boundary);
    if (chunk.trim()) segments.push(chunk);
    last = boundary + 2;
  }
  const tail = text.slice(last);
  if (tail.trim()) segments.push(tail);
  return segments.length > 1 ? segments : [text];
}

/** 单个 markdown 段：text 不变就整段跳过 unified 管线（流式期每个已完成段只解析一次）。 */
const MarkdownSegment = React.memo(
  function MarkdownSegment({
    text,
    segKey,
    remarkPlugins,
    t,
  }: {
    text: string;
    segKey: string;
    remarkPlugins: typeof sharedRemarkPlugins;
    t: Translate;
  }) {
    return <React.Fragment key={segKey}>{renderMarkdownWithSvg(text, segKey, remarkPlugins, t)}</React.Fragment>;
  },
  (prev, next) =>
    prev.text === next.text &&
    prev.segKey === next.segKey &&
    prev.remarkPlugins === next.remarkPlugins &&
    prev.t === next.t,
);

function renderMarkdownBlock(
  raw: string,
  key: string,
  remarkPlugins: typeof sharedRemarkPlugins,
  renderContext: MessageRenderContext,
): React.ReactNode {
  if (renderContext.isStreaming && raw.length > 0) {
    const segments = streamingMarkdownSegments(raw);
    if (segments.length > 1) {
      return (
        <React.Fragment key={key}>
          {segments.map((text, index) => (
            <MarkdownSegment
              key={`${key}-m${index}`}
              segKey={`${key}-m${index}`}
              text={text}
              remarkPlugins={remarkPlugins}
              t={renderContext.t}
            />
          ))}
        </React.Fragment>
      );
    }
  }
  return renderMarkdownWithSvg(raw, key, remarkPlugins, renderContext.t);
}

/* ---- Render parsed blocks (supports nested Answer/Thinking re-parse) ---- */
function renderBlocks(
  blocks: ParsedBlock[],
  keyPrefix: string,
  enableVisualizations: boolean | undefined,
  remarkPlugins: typeof sharedRemarkPlugins,
  renderContext: MessageRenderContext,
  svgBase = 0,
): React.ReactNode {
  let svgSeen = svgBase;
  return blocks.map((block, idx) => {
    const element = (
      <ParsedBlockView
        key={`${keyPrefix}-${idx}`}
        block={block}
        keyPrefix={`${keyPrefix}-${idx}`}
        enableVisualizations={enableVisualizations}
        remarkPlugins={remarkPlugins}
        renderContext={renderContext}
        svgBase={svgSeen}
      />
    );
    svgSeen += countSvgDiagrams(block);
    return element;
  });
}

/**
 * 单个解析块的 memo 壳：流式期间 blocks 数组每 tick 都重建，
 * 但旧块的 content/tagName/childrenText 字符串不变 —— 比较字符串而不是对象引用，
 * 未变块整段跳过 remark/rehype/KaTeX 管线（每条回答的大头开销）。
 * compProps 由同一段源文本决定，字符串相等即隐含 props 相等。
 */
const ParsedBlockView = React.memo(
  function ParsedBlockView({
    block,
    keyPrefix,
    enableVisualizations,
    remarkPlugins,
    renderContext,
    svgBase,
  }: {
    block: ParsedBlock;
    keyPrefix: string;
    enableVisualizations: boolean | undefined;
    remarkPlugins: typeof sharedRemarkPlugins;
    renderContext: MessageRenderContext;
    svgBase: number;
  }) {
    return (
      <React.Fragment key={keyPrefix}>
        {renderParsedBlock(block, keyPrefix, enableVisualizations, remarkPlugins, renderContext, svgBase)}
      </React.Fragment>
    );
  },
  (prev, next) =>
    prev.block.type === next.block.type &&
    prev.block.content === next.block.content &&
    prev.block.tagName === next.block.tagName &&
    prev.block.childrenText === next.block.childrenText &&
    prev.keyPrefix === next.keyPrefix &&
    prev.svgBase === next.svgBase &&
    prev.enableVisualizations === next.enableVisualizations &&
    prev.remarkPlugins === next.remarkPlugins &&
    prev.renderContext === next.renderContext,
);

/* ---- Render a single parsed block ---- */
const renderParsedBlock = (
  block: ParsedBlock,
  key: string,
  enableVisualizations: boolean | undefined,
  remarkPlugins: typeof sharedRemarkPlugins = sharedRemarkPlugins,
  renderContext: MessageRenderContext,
  svgBase = 0,
) => {
  if (block.type === 'markdown') {
    const raw = block.content || '';
    // markdown 块中若仍含已知自定义标签（嵌套拆分解耦 / 流式半截后残留），二次 parse 走组件管道。
    if (hasKnownCustomTags(raw)) {
      const nested = parseXmlTags(raw);
      if (nested.some((b) => b.type === 'component')) {
        return (
          <React.Fragment key={key}>
            {renderBlocks(nested, key, enableVisualizations, remarkPlugins, renderContext, svgBase)}
          </React.Fragment>
        );
      }
    }
    return renderMarkdownBlock(raw, key, remarkPlugins, renderContext);
  }

  const { tagName, props: compProps, childrenText } = block;

  // Visualization components
  if (enableVisualizations && tagName && VIZ_TAG_SET.has(tagName)) {
    const repairContext = tagName === 'SvgDiagram'
      ? {
          sessionId: renderContext?.sessionId,
          messageId: renderContext?.messageId,
          blockIndex: svgBase,
          modelId: renderContext?.repairModelId,
          topic: renderContext?.topic,
        }
      : undefined;
    return (
      <VizErrorBoundary key={key} label={renderContext.t("trace.viz.fallbackLabel")} source={childrenText || ''}>
        <ChatMessageVisualizations
          tagName={tagName}
          props={compProps || {}}
          childrenText={childrenText || ''}
          repairContext={repairContext}
        />
      </VizErrorBoundary>
    );
  }

  // Inline ToolCall
  if (tagName === 'ToolCall') {
    return <ToolCallDashboard key={key} toolCalls={[{ id: `inline-${key}`, name: typeof compProps?.name === 'string' ? compProps.name : '', arguments: compProps || {}, status: 'success' }]} />;
  }

  // Answer / Thinking：内层可能含 FormulaSteps 等，必须二次 parse，不可直接 rehype-raw。
  if (tagName === 'Answer' || tagName === 'Thinking') {
    const innerBlocks = parseXmlTags(childrenText || '');
    return (
      <React.Fragment key={key}>
        {renderBlocks(innerBlocks, key, enableVisualizations, remarkPlugins, renderContext, svgBase)}
      </React.Fragment>
    );
  }

  // Fallback: unknown tag
  return (
    <div key={key} style={{
      padding: '0.5rem',
      border: '1px dashed var(--md-sys-color-outline-variant)',
      color: 'var(--md-sys-color-on-surface-variant)',
      fontSize: '0.8rem',
      borderRadius: '6px',
      margin: '0.5rem 0',
    }}>
      [&lt;{tagName} /&gt; 交互式内容正在加载或不可用]
    </div>
  );
};

/* ---- Main MessageContent component ---- */
const MessageContentComponent: React.FC<MessageContentProps> = ({
  content,
  enableVisualizations = true,
  preserveLineBreaks = false,
  sessionId,
  messageId,
  repairModelId,
  topic,
  isStreaming = false,
  citations,
}) => {
  const t = useT();
  const catalog = citations ?? EMPTY_CITATIONS;
  const renderedContent = useStreamingText(content, isStreaming);
  const { blocks } = useMemo(() => {
    return parseChatContent(renderedContent);
  }, [renderedContent]);

  const remarkPlugins = useMemo(() => {
    const plugins = [...sharedRemarkPlugins];
    if (preserveLineBreaks) plugins.push(remarkSoftBreaks);
    if (catalog.length) plugins.push(remarkInlineCitations);
    return plugins;
  }, [preserveLineBreaks, catalog.length]);

  // renderContext 必须是稳定引用：它进 ParsedBlockView 的 memo 比较，
  // 每 tick 新建会让块级 memo 全部失效（流式期的主要收益就在这个比较上）。
  const renderContext = useMemo<MessageRenderContext>(
    () => ({ sessionId, messageId, repairModelId, topic, isStreaming, t }),
    [sessionId, messageId, repairModelId, topic, isStreaming, t],
  );

  const rendered = useMemo(() => {
    return renderBlocks(blocks, 'root', enableVisualizations, remarkPlugins, renderContext);
  }, [blocks, enableVisualizations, remarkPlugins, renderContext]);
  return <CitationCatalogContext.Provider value={catalog}>{rendered}</CitationCatalogContext.Provider>;
};

export const MessageContent = React.memo(MessageContentComponent);
MessageContent.displayName = 'MessageContent';

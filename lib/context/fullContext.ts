import type { ContextManager, BuildContextResult, BuildContextOptions } from './types';
import { closeReferenceMaterials, getMaxTokens } from './types';
import { assembleReference, pickReferenceTier, summarizePageMarkdown } from './referenceTiers';
import { DEFAULT_MODEL_ID, type CustomApiGroup } from '@/lib/ai/models';
import { isPageBoundContext, type ChatContext } from '@/lib/types/chat';
import { contentTree } from '@/lib/content-data/manifest';
import { getContentItem } from '@/lib/content-data';
import { readContentMarkdown } from '@/lib/content/loader';
import type { SubjectId, CategoryId } from '@/lib/types/content';
import { estimateTokens } from './estimateTokens';
import { SOFT_LIMIT_RATIO } from './estimateFullContext';

// ── 文件夹树摘要（模块级缓存：课程目录运行时不变） ──

let _treeSummaryCache: string | null = null;

function buildTreeSummary(): string {
  if (_treeSummaryCache) return _treeSummaryCache;
  const lines: string[] = [];
  for (const subject of contentTree.subjects) {
    lines.push(`[${subject.name}]`);
    for (const cat of subject.categories) {
      const itemTitles = cat.items.map((i) => i.title).join(', ');
      lines.push(`  ${cat.name}: ${itemTitles || '(空)'}`);
    }
  }
  _treeSummaryCache = lines.join('\n');
  return _treeSummaryCache;
}

// ── 全量上下文管理器 ──
// 不再维护模块级 pageId hash 槽：它不缓存正文，且看板改绑上游 cachedTokens。

export class FullContextManager implements ContextManager {
  mode = 'full' as const;
  private model: string;
  private customGroups: CustomApiGroup[];

  constructor(model = DEFAULT_MODEL_ID, customGroups: CustomApiGroup[] = []) {
    this.model = model;
    this.customGroups = customGroups;
  }

  async buildContext(
    chatContext: ChatContext,
    _userMessage?: string,
    options?: BuildContextOptions,
  ): Promise<BuildContextResult> {
    const maxTokens = getMaxTokens(this.model, this.customGroups);
    // Agent 的通用对话不绑定当前章节：什么都不预注入（既不带默认章节正文，也不带整本课程目录）。
    // 它需要了解课程 / 教材结构时，自己调用 getOutline / getSection 等工具去查；
    // 引用内容由用户在输入框里显式注入（引用笔记 / 附件），不靠「默认打开的那一页」。
    const pageBound = isPageBoundContext(chatContext);
    const outline = pageBound ? buildTreeSummary() : "";
    const pageContent = pageBound
      ? readContentMarkdown(chatContext.subjectId, chatContext.categoryId, chatContext.itemId)
      : null;
    const item = pageBound
      ? getContentItem(
          chatContext.subjectId as SubjectId,
          chatContext.categoryId as CategoryId,
          chatContext.itemId,
        )
      : undefined;
    const title = item?.title ?? chatContext.currentTopic;
    const summary = pageContent ? summarizePageMarkdown(pageContent, title) : "";
    const full = pageContent ? `## 当前内容：${title}\n${pageContent}` : "";

    let tier = pickReferenceTier({ compact: options?.compact });
    let assembled = assembleReference({ outline, summary, full }, tier);
    let tokenCount = estimateTokens(closeReferenceMaterials(assembled));
    if (!options?.compact && tokenCount > maxTokens) {
      tier = "summary";
      assembled = assembleReference({ outline, summary, full }, tier);
      tokenCount = estimateTokens(closeReferenceMaterials(assembled));
    }
    if (options?.compact && tokenCount / Math.max(maxTokens, 1) >= SOFT_LIMIT_RATIO) {
      tier = "outline";
      assembled = assembleReference({ outline, summary, full }, tier);
      tokenCount = estimateTokens(closeReferenceMaterials(assembled));
    }

    // 提问只留在最后一条 user；这里只放参考材料，收尾不含用户原话。
    const context = closeReferenceMaterials(assembled);
    tokenCount = estimateTokens(context);

    const sources = this.collectSources(chatContext);

    return {
      context,
      tokenCount,
      maxTokens,
      cacheHit: false,
      sources,
      overflow: tokenCount > maxTokens,
      tier,
    };
  }

  async getFullContext(chatContext: ChatContext): Promise<string> {
    const result = await this.buildContext(chatContext, "", { compact: false });
    return result.context.replace(/\n\n以上是参考材料$/, "");
  }

  private collectSources(chatContext: ChatContext): string[] {
    const sources: string[] = [];
    if (!isPageBoundContext(chatContext)) return sources;
    const item = getContentItem(
      chatContext.subjectId as SubjectId,
      chatContext.categoryId as CategoryId,
      chatContext.itemId,
    );
    if (item) sources.push(item.title);
    return sources;
  }
}

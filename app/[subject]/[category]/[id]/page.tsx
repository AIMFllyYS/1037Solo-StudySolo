import { notFound } from "next/navigation";
import { isSubjectId } from "@/lib/types/content";
import type { ContentItem } from "@/lib/types/content";
import { contentTree, getContentItem, getSubject, getCategory } from "@/lib/content-data";
import { readContent, readExamples } from "@/lib/content/loader";
import { deriveExampleKeyFor } from "@/lib/content/categoryKeys";
import { normalizeDirectiveLabels } from "@/lib/markdown/normalizeDirectiveLabels";
import { layoutFlags, resolveLayoutProfile } from "@/lib/content/layoutProfile";
import NoteRendererServer from "@/components/notes/NoteRendererServer";
import ContentPageClient from "./ContentPageClient";

interface PageProps {
  params: Promise<{ subject: string; category: string; id: string }>;
}

// 构建期为 manifest 中的全部 (subject, category, id) 预渲染（SSG），EdgeOne 边缘缓存。
// 正文 Markdown→HTML（含 KaTeX/高亮）在此一次完成，客户端切章时不再解析。
export async function generateStaticParams() {
  const params: { subject: string; category: string; id: string }[] = [];
  for (const subject of contentTree.subjects) {
    for (const category of subject.categories) {
      const walk = (items: ContentItem[]) => {
        for (const item of items) {
          // navigationOnly 仅作导航分组父节点（课堂课节），本身不生成路由。
          if (!item.navigationOnly) {
            params.push({ subject: subject.id, category: category.id, id: item.id });
          }
          if (item.children) walk(item.children);
        }
      };
      walk(category.items);
    }
  }
  return params;
}

// 未被 generateStaticParams 枚举的路径直接 404；manifest 中的 stub 仍会被枚举并生成占位页。
export const dynamicParams = false;
// 内容随 git 提交变动 → 构建期烘焙即可，无需时间型增量再生。
export const revalidate = false;

export default async function ContentPage({ params }: PageProps) {
  const { subject, category, id } = await params;

  // 科目做运行时类型守卫；分类由 manifest 动态查找校验（彻底解耦后 CategoryId 不再是固定联合类型）。
  if (!isSubjectId(subject)) {
    notFound();
  }

  const subjectData = getSubject(subject);
  const categoryData = getCategory(subject, category);
  const item = getContentItem(subject, category, id);

  // 内容项不存在时显示占位
  if (!subjectData || !categoryData) {
    notFound();
  }

  // 导航分组父节点不对应文章，直接 404（正常情况下静态参数已将其排除）。
  if (item?.navigationOnly) {
    notFound();
  }

  // 服务端直接读取正文做首屏 SSR，消除「客户端挂载后再 fetch /api/section」的瀑布与骨架闪烁。
  const renderType = item?.renderType ?? 'markdown';
  const rawContent = readContent(subject, category, id, renderType);
  const normalizedContent = (rawContent && renderType === 'markdown') ? normalizeDirectiveLabels(rawContent) : rawContent;

  // 正文 markdown 在服务端/构建期渲染为 React 树，作为插槽下传给客户端外壳；
  // 浏览器只做协调 + 交互岛水合，不再在客户端跑 react-markdown + KaTeX + 高亮。
  const renderedNote =
    (normalizedContent && renderType === 'markdown')
      ? <NoteRendererServer content={normalizedContent} />
      : null;

  // 例题服务端预读全文（与正文一致走 SSR），点击卡片时无需再 fetch。
  // 只有会挂载 ExampleTab 的 markdown 类型才需要例题；html/component 类型不显示例题 tab。
  // 是否有例题由板块在 manifest 中声明的 capabilities 决定（deriveExampleKeyFor 对无 examples 能力的板块返回空），
  // 短路可减少每次切换的一次 fs.readdirSync 探测（含 catch），配合 hover prefetch 后 SSR 关键路径进一步收窄。
  const { chapterId, sectionId } =
    renderType === "markdown"
      ? deriveExampleKeyFor(categoryData, id)
      : { chapterId: "", sectionId: "" };
  const initialExamples =
    chapterId && sectionId ? readExamples(subject, chapterId, sectionId) : [];

  const profile = resolveLayoutProfile(categoryData, item);
  const flags = layoutFlags(profile, categoryData, item);

  return (
    <ContentPageClient
      subjectId={subject}
      categoryId={category}
      itemId={id}
      initialContent={normalizedContent}
      renderedNote={renderedNote}
      initialExamples={initialExamples}
      sectionId={sectionId}
      exampleChapterId={chapterId}
      itemTitle={item?.title ?? ""}
      itemSummary={item?.summary ?? ""}
      subjectName={subjectData.name}
      categoryName={categoryData.name}
      itemStatus={item?.status ?? "stub"}
      renderType={renderType}
      materialRole={item?.materialRole}
      layoutProfile={profile}
      layoutFlags={flags}
    />
  );
}

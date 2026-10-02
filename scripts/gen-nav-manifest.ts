// 生成导航瘦身 JSON：仅 id/title/children/status。
// 用法: npx tsx scripts/gen-nav-manifest.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { contentTree } from '../lib/content-data/manifest';
import { firstLearnHref } from '../lib/content-data';
import type { ContentItem } from '@/lib/types/content';

function slimItem(item: ContentItem): ContentItem {
  const out: ContentItem = {
    id: item.id,
    title: item.title,
    type: item.type,
    status: item.status,
  };
  // 课堂内容需要这些字段驱动渲染 / 题库共享 / 分组折叠（正文与路径不进导航瘦身文件）。
  if (item.renderType) out.renderType = item.renderType;
  if (item.navigationOnly) out.navigationOnly = true;
  if (item.materialRole) out.materialRole = item.materialRole;
  if (item.lessonRef) out.lessonRef = item.lessonRef;
  if (item.quizRef) out.quizRef = item.quizRef;
  // 课堂纪要 minutes 叶子用 item.layoutProfile="full" 覆盖 summary 板块默认的 article 布局。
  if (item.layoutProfile) out.layoutProfile = item.layoutProfile;
  if (item.children?.length) out.children = item.children.map(slimItem);
  return out;
}

const nav = {
  subjects: contentTree.subjects.map((subject) => ({
    id: subject.id,
    name: subject.name,
    icon: subject.icon,
    categories: subject.categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      ...(cat.capabilities?.length ? { capabilities: cat.capabilities } : {}),
      ...(cat.keyStrategy ? { keyStrategy: cat.keyStrategy } : {}),
      // 保留板块级默认布局：summary 板块默认 article，避免运行时从 nav 反序列化时
      // 丢失布局、被 capabilities(含 quiz) 反推成 full 而让大一旧 summary 误显示测验 Tab。
      ...(cat.layoutProfile ? { layoutProfile: cat.layoutProfile } : {}),
      items: cat.items.map(slimItem),
    })),
  })),
};

const outPath = path.join(process.cwd(), 'lib/content-data/nav.generated.json');
fs.writeFileSync(outPath, JSON.stringify(nav, null, 2));
console.log(`Wrote ${outPath}`);

// Home renders a few fields per course; its client chunk must not import the
// 376 KB navigation tree merely to display a bookshelf card.
const home = contentTree.subjects.map((subject) => ({
  id: subject.id,
  name: subject.name,
  icon: subject.icon,
  categoryCount: subject.categories.length,
  chapterCount: subject.categories.reduce((total, category) => total + category.items.length, 0),
  learnHref: firstLearnHref(subject),
}));
const homePath = path.join(process.cwd(), 'lib/content-data/home.generated.json');
fs.writeFileSync(homePath, JSON.stringify(home, null, 2));
console.log(`Wrote ${homePath}`);

// 注册表一致性校验：把"忘了注册 / 忘了放文件 / 忘了重跑生成脚本"从线上空页变成构建失败。
// 用法：
//   npx tsx scripts/check-registry-consistency.ts              # 有 error 则非零退出（prebuild 用）
//   npx tsx scripts/check-registry-consistency.ts --report-only # 只打印，不失败（盘点存量问题）
//   npx tsx scripts/check-registry-consistency.ts --fix-nav     # 顺手重生成 nav.generated.json
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { contentTree } from '../lib/content-data/manifest';
import { firstLearnHref } from '../lib/content-data';
import { SUBJECT_REGISTRY, SUBJECT_BY_ID, getSubjectMeta } from '../lib/content-data/subjects.registry';
import { isSubjectIconName } from '../lib/ui/subjectIcons';
import { ACADEMIC_YEAR_IDS } from '../lib/constants/academic-year';
import { deriveContentKey, hasCapability, resolveQuizId } from '../lib/content/categoryKeys';
import { CONTENT_PATH_RESOLVERS } from '../lib/content/contentPaths';
import { resolveLectureFile } from '../lib/content/lectures/paths';
import type { Category, ContentItem, Subject } from '../lib/types/content';

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, 'content');
const reportOnly = process.argv.includes('--report-only');
const fixNav = process.argv.includes('--fix-nav');

const errors: string[] = [];
const warnings: string[] = [];
const err = (rule: string, msg: string) => errors.push(`[${rule}] ${msg}`);
const warn = (rule: string, msg: string) => warnings.push(`[${rule}] ${msg}`);

/**
 * content/ 下不参与"孤儿 md"检查的目录。
 * - _raw / _raw-src：解析中间产物
 * - chapters：概率论 detail 特例目录，item id 与文件名映射由 loader 负责，另行校验
 * - examples / quiz / .index：非 manifest 直接条目，另有规则
 * - _backup*：历史备份
 */
const ORPHAN_SKIP_TOP = new Set(['_raw', '_raw-src', 'chapters', 'examples', 'quiz', '.index']);
const ORPHAN_SKIP_DIR = /^_backup/;

/**
 * 已知存量的孤儿文件（2026-09 收敛前就存在，不阻断构建，只 warning）。
 * 处置后请从此处删除，让规则重新对它们生效：
 * - probability/shizyan-yanlian/：拼写错误的历史目录（应为 shizhan-yanlian），需人工确认内容后合并或删除
 * - chemistry/detail/ppt-*.md：早期按 PPT 切分的详解草稿，manifest 只登记了 ppt-15~18；其余 41 个未挂载
 * - {maogai,modern-history}/detail/chXX-examples.md：出题脚本的工作文件（scripts/one-off/gen_maogai_quiz_*.py 引用），
 *   不在 UI 展示；建议移入 content/_raw/{subject}/ 或注册为 detail 子项
 */
const KNOWN_ORPHANS = new Set<string>(['probability/shizyan-yanlian']);
const KNOWN_ORPHAN_PATTERNS: RegExp[] = [
  /^chemistry\/detail\/ppt-\d+\.\d+\.md$/,
  /^(maogai|modern-history)\/detail\/ch\d{2}-examples\.md$/,
];
const isKnownOrphan = (rel: string) => KNOWN_ORPHANS.has(rel) || KNOWN_ORPHAN_PATTERNS.some((re) => re.test(rel));

function walkLeaves(items: ContentItem[], out: ContentItem[] = []): ContentItem[] {
  for (const item of items) {
    if (item.children?.length) walkLeaves(item.children, out);
    else out.push(item);
  }
  return out;
}

function walkAll(items: ContentItem[], out: ContentItem[] = []): ContentItem[] {
  for (const item of items) {
    out.push(item);
    if (item.children?.length) walkAll(item.children, out);
  }
  return out;
}

/** 与 lib/content/loader.ts readContent 保持一致的路径解析。 */
function contentFileFor(subject: Subject, cat: Category, item: ContentItem): string | null {
  if (item.renderType === 'component') return null;
  // 课堂课节分组父节点不对应文件；课堂材料走 lectures 受控目录（由生成目录登记）。
  if (item.navigationOnly) return null;
  if (item.materialRole) {
    return resolveLectureFile(subject.id, item.id)?.absPath ?? null;
  }
  const ext = item.renderType === 'html' ? 'html' : 'md';
  const detail = getSubjectMeta(subject.id)?.contentRoot?.detail ?? 'subject-tree';
  return CONTENT_PATH_RESOLVERS[detail](subject.id, cat.id, item.id, ext);
}

// ── 1. registry ↔ manifest ─────────────────────────────────────
{
  const treeIds = new Set(contentTree.subjects.map((s) => s.id));
  for (const s of SUBJECT_REGISTRY) {
    if (!treeIds.has(s.id)) err('registry↔manifest', `学科 '${s.id}' 在 registry 中但 manifest 缺失`);
    if (!isSubjectIconName(s.icon)) err('registry.icon', `学科 '${s.id}' 的 icon '${s.icon}' 不在 lib/ui/subjectIcons.ts 白名单`);
    if (!(ACADEMIC_YEAR_IDS as readonly string[]).includes(s.year)) err('registry.year', `学科 '${s.id}' 的 year '${s.year}' 非法`);
  }
  for (const s of contentTree.subjects) {
    if (!(s.id in SUBJECT_BY_ID)) err('registry↔manifest', `学科 '${s.id}' 在 manifest 中但 registry 缺失`);
    const meta = SUBJECT_BY_ID[s.id];
    if (meta && (s.name !== meta.name || s.icon !== meta.icon)) {
      err('registry↔manifest', `学科 '${s.id}' 的 name/icon 未通过 subjectHeader() 派生，与 registry 不一致`);
    }
  }
  for (const y of ACADEMIC_YEAR_IDS) {
    if (!SUBJECT_REGISTRY.some((s) => s.year === y)) warn('registry.year', `学年 '${y}' 下没有任何学科`);
  }
  for (const s of SUBJECT_REGISTRY) {
    const promptFile = 'promptFile' in s && typeof s.promptFile === 'string' ? s.promptFile : undefined;
    const rel = promptFile ?? `subjects/${s.id}.md`;
    if (!fs.existsSync(path.join(ROOT, 'lib', 'ai', 'prompts', rel))) {
      (promptFile ? err : warn)('registry.prompt', `学科 '${s.id}' 的提示词 lib/ai/prompts/${rel} 不存在${promptFile ? '' : '（AI 将只用 global.md）'}`);
    }
  }
}

// ── 2. manifest 内部：id 唯一、能力合法、key 可推导 ───────────────
const VALID_CAPS = new Set(['examples', 'quiz', 'search', 'media']);
for (const subject of contentTree.subjects) {
  const catIds = new Set<string>();
  for (const cat of subject.categories) {
    if (catIds.has(cat.id)) err('manifest.unique', `${subject.id} 板块 id 重复: ${cat.id}`);
    catIds.add(cat.id);
    for (const cap of cat.capabilities ?? []) {
      if (!VALID_CAPS.has(cap)) err('manifest.capability', `${subject.id}/${cat.id} 非法能力 '${cap}'`);
    }
    const itemIds = new Set<string>();
    for (const item of walkAll(cat.items)) {
      if (itemIds.has(item.id)) err('manifest.unique', `${subject.id}/${cat.id} item id 重复: ${item.id}`);
      itemIds.add(item.id);
    }
    const wantsKey = hasCapability(cat, 'quiz') || hasCapability(cat, 'examples') || hasCapability(cat, 'media');
    if (wantsKey && !cat.keyStrategy) {
      err('manifest.keyStrategy', `${subject.id}/${cat.id} 声明了 quiz/examples/media 能力但没有 keyStrategy`);
    }
  }
}

// ── 3. manifest item → 文件存在 ───────────────────────────────────
for (const subject of contentTree.subjects) {
  for (const cat of subject.categories) {
    for (const item of walkLeaves(cat.items)) {
      if (item.status === 'stub') continue;
      const file = contentFileFor(subject, cat, item);
      if (file && !fs.existsSync(file)) {
        err('item→file', `${subject.id}/${cat.id}/${item.id} 已注册但文件不存在: ${path.relative(ROOT, file)}`);
      }
    }
    // 章级 section 节点（有 children）若也有正文（如概率论 chXX/index.md），存在即可，不强制。
  }
}

// ── 4. 文件 → manifest 有条目（孤儿 md）──────────────────────────
{
  const registered = new Set<string>();
  for (const subject of contentTree.subjects) {
    for (const cat of subject.categories) {
      for (const item of walkAll(cat.items)) {
        const file = contentFileFor(subject, cat, item);
        if (file) registered.add(path.relative(CONTENT, file).replace(/\\/g, '/'));
      }
    }
  }
  const subjectDirs = new Set<string>(contentTree.subjects.map((s) => s.id));
  for (const top of fs.readdirSync(CONTENT, { withFileTypes: true })) {
    if (!top.isDirectory() || ORPHAN_SKIP_TOP.has(top.name) || ORPHAN_SKIP_DIR.test(top.name)) continue;
    if (!subjectDirs.has(top.name)) {
      warn('orphan.dir', `content/${top.name}/ 不对应任何已注册学科`);
      continue;
    }
    for (const catDir of fs.readdirSync(path.join(CONTENT, top.name), { withFileTypes: true })) {
      if (!catDir.isDirectory() || ORPHAN_SKIP_DIR.test(catDir.name)) continue;
      // lectures/ 是课堂课节目录，由 gen-lectures / check-lectures 治理，不走「板块目录」规则。
      if (catDir.name === 'lectures') continue;
      const relDir = `${top.name}/${catDir.name}`;
      const subject = contentTree.subjects.find((s) => s.id === top.name)!;
      if (!subject.categories.some((c) => c.id === catDir.name)) {
        (isKnownOrphan(relDir) ? warn : err)('orphan.category', `content/${relDir}/ 不对应 ${top.name} 的任何板块`);
        continue;
      }
      const files = fs.readdirSync(path.join(CONTENT, top.name, catDir.name)).filter((f) => /\.(md|html)$/.test(f));
      for (const f of files) {
        const rel = `${relDir}/${f}`;
        if (!registered.has(rel)) {
          (isKnownOrphan(rel) ? warn : err)('orphan.file', `content/${rel} 存在但未在 manifest 注册`);
        }
      }
    }
  }
}

// ── 5. examples / quiz 目录名可反解到某个 item ────────────────────
{
  const exRoot = path.join(CONTENT, 'examples');
  const quizRoot = path.join(CONTENT, 'quiz');
  for (const subject of contentTree.subjects) {
    const keyIndex = new Map<string, string>(); // `${chapterId}/${sectionId}` → item path
    const quizIndex = new Map<string, string>(); // quizId → item path
    for (const cat of subject.categories) {
      for (const item of walkLeaves(cat.items)) {
        const key = deriveContentKey(cat, item.id);
        const p = `${subject.id}/${cat.id}/${item.id}`;
        if (hasCapability(cat, 'examples') && key.sectionId) keyIndex.set(`${key.chapterId}/${key.sectionId}`, p);
        // 课堂材料用显式 quizRef（四材料共享一套题），其余回退 keyStrategy 推导。
        const quizId = resolveQuizId(cat, item.id, item);
        if (hasCapability(cat, 'quiz') && quizId) quizIndex.set(quizId, p);
      }
    }
    // 概率论例题目录不带学科前缀：content/examples/chXX/X.Y
    const exDir = getSubjectMeta(subject.id)?.contentRoot?.detail === 'legacy-chapters' ? exRoot : path.join(exRoot, subject.id);
    if (fs.existsSync(exDir)) {
      for (const ch of fs.readdirSync(exDir, { withFileTypes: true })) {
        if (!ch.isDirectory()) continue;
        if (exDir === exRoot && !/^ch\d+$/.test(ch.name)) continue; // 根目录下其它学科文件夹
        for (const sec of fs.readdirSync(path.join(exDir, ch.name), { withFileTypes: true })) {
          if (!sec.isDirectory()) continue;
          if (!keyIndex.has(`${ch.name}/${sec.name}`)) {
            warn('examples.orphan', `content/examples/${exDir === exRoot ? '' : subject.id + '/'}${ch.name}/${sec.name}/ 无对应 item（或所属板块未声明 examples 能力）`);
          }
        }
      }
    }
    const qDir = path.join(quizRoot, subject.id);
    if (fs.existsSync(qDir)) {
      for (const f of fs.readdirSync(qDir)) {
        if (!f.endsWith('.json')) continue;
        const id = f.replace(/\.json$/, '');
        if (!quizIndex.has(id)) warn('quiz.orphan', `content/quiz/${subject.id}/${f} 无对应 item（或所属板块未声明 quiz 能力）`);
      }
    }
  }
}

// ── 6. nav.generated.json 与 manifest 同步 ────────────────────────
{
  const navPath = path.join(ROOT, 'lib', 'content-data', 'nav.generated.json');
  const regen = () => execFileSync(process.execPath, ['--import', 'tsx', path.join(ROOT, 'scripts', 'gen-nav-manifest.ts')], { stdio: 'ignore' });
  const slim = (item: ContentItem): ContentItem => ({
    id: item.id,
    title: item.title,
    type: item.type,
    status: item.status,
    ...(item.renderType ? { renderType: item.renderType } : {}),
    ...(item.navigationOnly ? { navigationOnly: true } : {}),
    ...(item.materialRole ? { materialRole: item.materialRole } : {}),
    ...(item.lessonRef ? { lessonRef: item.lessonRef } : {}),
    ...(item.quizRef ? { quizRef: item.quizRef } : {}),
    ...(item.layoutProfile ? { layoutProfile: item.layoutProfile } : {}),
    ...(item.children?.length ? { children: item.children.map(slim) } : {}),
  });
  const expected = JSON.stringify({
    subjects: contentTree.subjects.map((s) => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      categories: s.categories.map((c) => ({
        id: c.id,
        name: c.name,
        ...(c.capabilities?.length ? { capabilities: c.capabilities } : {}),
        ...(c.keyStrategy ? { keyStrategy: c.keyStrategy } : {}),
        ...(c.layoutProfile ? { layoutProfile: c.layoutProfile } : {}),
        items: c.items.map(slim),
      })),
    })),
  });
  const actual = fs.existsSync(navPath) ? JSON.stringify(JSON.parse(fs.readFileSync(navPath, 'utf8'))) : '';
  if (actual !== expected) {
    if (fixNav) {
      regen();
      console.log('已重生成 lib/content-data/nav.generated.json');
    } else {
      err('nav.stale', 'lib/content-data/nav.generated.json 与 manifest 不一致，请运行 pnpm gen-nav');
    }
  }
  const homePath = path.join(ROOT, 'lib', 'content-data', 'home.generated.json');
  const expectedHome = JSON.stringify(contentTree.subjects.map((subject) => ({
    id: subject.id, name: subject.name, icon: subject.icon,
    categoryCount: subject.categories.length,
    chapterCount: subject.categories.reduce((total, category) => total + category.items.length, 0),
    learnHref: firstLearnHref(subject),
  })));
  const actualHome = fs.existsSync(homePath) ? JSON.stringify(JSON.parse(fs.readFileSync(homePath, 'utf8'))) : '';
  if (actualHome !== expectedHome) {
    if (fixNav) regen();
    else err('home.stale', 'lib/content-data/home.generated.json 与 manifest 不一致，请运行 pnpm gen-nav');
  }
}

// ── 输出 ─────────────────────────────────────────────────────────
for (const w of warnings) console.warn(`warning ${w}`);
for (const e of errors) console.error(`error   ${e}`);
console.log(`\nregistry consistency: ${errors.length} error(s), ${warnings.length} warning(s)`);
if (errors.length && !reportOnly) process.exit(1);

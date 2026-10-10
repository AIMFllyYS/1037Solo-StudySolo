# 新学科接入 SOP

本手册只覆盖新增学科所需的注册、内容挂载和验证。示例中的 `xxx` 替换为目标 `SubjectId`；已有学科迁移或框架组件开发不属于本流程。

## 1. 注册学科

在 `lib/content-data/subjects.registry.ts` 的 `SUBJECT_REGISTRY` 末尾追加一个对象。字段含义以同文件 `SubjectMeta` 接口注释为准：

```ts
{
  id: 'xxx',
  name: '学科完整中文名',
  shortName: '移动端短名',
  icon: '白名单中的 Lucide 图标名',
  color: '#2563eb',
  year: 'freshman-2', // 或 'sophomore-1'
}
```

`icon` 必须是 `lib/ui/subjectIcons.ts` 白名单内的名字，否则 `pnpm exec tsc --noEmit` 会报错。需要学科专属提示词时再填写 `promptFile`；概率论历史目录特例才填写 `contentRoot: { detail: 'legacy-chapters' }`。

## 2. 挂载内容树

在 `lib/content-data/manifest.ts` 的 `contentTree.subjects` 追加：

```ts
{
  ...subjectHeader('xxx'),
  categories: sophomoreCategorySkeleton(xxxTextbookItems),
}
```

上例适用于教材为主、其余标准板块暂时为空的学科。也可以手写 `categories: [category('textbook', ...), category('detail', ...), ...]`。标准板块的名称、能力和 `keyStrategy` 来自 `lib/content-data/category-templates.ts`；私有板块必须在 manifest 中写完整对象，并明确声明 `capabilities` / `keyStrategy`。

## 3. 教材条目

先准备原始文件：

```bash
python scripts/extract-textbook-pdf.py --pdf <pdf-path> --subject xxx --basename textbook
```

该步骤产出 `content/_raw/xxx/textbook.md` 与 `content/_raw/xxx/textbook.toc.json`（以及图片）。随后运行：

```bash
python scripts/ingest-sophomore-textbooks.py --subject xxx
```

脚本生成 `lib/content-data/subjects/xxx/xxx-textbook.ts`，导出名固定为 `xxxTextbookItems`（kebab-case 学科 id 转 camelCase），并生成 `content/xxx/textbook/` 下的教材正文。生成的导航树是“章 → 节”两级结构。目录生成由 `scripts/content/textbook_catalog.py` 负责：histology、biochemistry、instrumental-analysis、cell-biology 按连续章节主题写到同学科 `textbook/` 子目录，原入口只组合这些数组；其他学科保留同学科目录内的单一数组。

原始教材内容、目录层级或标题需调整时，先修改原始材料，再运行接入脚本；该脚本会替换该学科 `content/xxx/textbook/*.md`，所以应从当前分支审查生成 diff。单独维护目录 writer 时使用 `python -B scripts/content/test_textbook_catalog.py`，它只在临时目录检查输出、分组顺序、嵌套及转义，不会重生成仓库正文。

## 4. 正文文件

正文按以下约定放置：

```text
content/xxx/{category}/{itemId}.md
```

例如 `content/xxx/detail/1.1.md`。`itemId` 必须与 manifest 中对应 category 的 item id 一致。教材脚本生成的正文遵循其自身的 `textbook/` 路径。

## 5. 可选的学科提示词

如需覆盖全局 AI 行为，新增 `lib/ai/prompts/subjects/xxx.md`；不新增时只使用 `lib/ai/prompts/global.md`。提示词文件名和 registry 中的 `promptFile` 保持一致。

## 6. 验证

完成注册和挂载后依次执行：

```bash
pnpm check:registry       # 必须 0 error
pnpm exec tsc --noEmit
pnpm dev
```

开发服务器启动后访问 `/<xxx>/textbook/ch01`（按实际生成的首章 id 调整），确认侧栏、正文和路由均可用。若新增了检索能力相关内容，再运行 `pnpm build-index` 重建索引。

## 7. 本流程不需要改动

新增学科不需要修改以下位置：

- `components/`
- `app/`
- `lib/ai/agent/tools/`
- `lib/constants/`
- 任何 `ICON_MAP`

图标统一通过 registry 与共享 `SubjectIcon` 使用；不要在组件或页面中新增学科名称、图标映射或 `categoryId === '...'` 判断。

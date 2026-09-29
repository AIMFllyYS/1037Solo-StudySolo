# SOP 05 — 内容注册与 AI 工具可达性验证

## 适用场景

所有内容板块 SOP（01-04）执行完毕后的最终集成步骤。确保产出的内容在 manifest 中注册、文件路径正确、且右侧 AI 面板能通过工具链访问到内容。

## 输入物料

| 物料 | 说明 |
|------|------|
| 新产出的 .md / .json 文件 | 由 01-04 SOP 生成 |
| 文件路径与 ID 列表 | 由内容生产 subagent 汇报 |

## 执行角色分配

| 角色 | 类型 | 职责 |
|------|------|------|
| Integrator | GeneralPurpose subagent | 执行所有注册和验证步骤 |

本 SOP 通常由单个 subagent 完成（manifest 操作需顺序执行，不宜并行）。

## 步骤流程

### Step 1：收集产出清单

从前序 SOP 的产出 subagent 收集以下信息：

```
| 文件路径 | subjectId | categoryId | itemId | title | status |
|----------|-----------|------------|--------|-------|--------|
| content/chemistry/textbook/ch01.md | chemistry | textbook | ch01 | 第一章 绪论 | done |
| content/chemistry/recording/rec-05.md | chemistry | recording | rec-05 | 第五讲·烷烃 | done |
...
```

### Step 2：manifest 注册

编辑 `lib/content-data/manifest.ts` 中 `contentTree` 对应科目的对应 category：

#### 注册规则

1. **不要重复注册**：先检查 items 数组中是否已有相同 id 的条目
2. **保持排序**：按 id 数字顺序排列（ch01 < ch02 < ...，rec-01 < rec-02 < ...）
3. **status 字段**：内容完成设为 `'done'`，占位设为 `'stub'`
4. **title 字段**：简洁明确，如 `'第一章·事件与概率'`

#### 示例

```typescript
// lib/content-data/manifest.ts 中对应位置
{
  id: 'textbook',
  name: '教材',
  items: [
    { id: 'ch01', title: '第一章·绪论', type: 'document', status: 'done' },
    { id: 'ch02', title: '第二章·烷烃', type: 'document', status: 'done' },
  ],
},
```

### Step 3：路径可达性验证

对每个新注册的 item，验证 `lib/content/loader.ts` 中的 `readContentMarkdown()` 能正确读取：

1. **通用路径**（`contentRoot.detail` 缺省为 `subject-tree`）：
   - 函数会寻找 `content/{subjectId}/{categoryId}/{itemId}.md`
   - 确认文件确实存在于该路径

2. **概率论历史目录**（registry 声明 `contentRoot: { detail: 'legacy-chapters' }`）：
   - `probability` + `detail` → `content/chapters/{chapterId}/{sectionId}.md`
   - 其他 category 仍走通用路径

3. **验证命令**：
   ```bash
   # 在项目根目录运行，统一检查 registry、manifest 与文件路径
   pnpm check:registry
   ```

   如需单独查看某页正文，可在 dev server 启动后访问对应路由；服务端读取统一经过 `lib/content/loader.ts` 的 `readContentMarkdown()`。

### Step 4：AI 工具链验证

验证 AI 面板的四个工具能正确工作：

#### 4.1 getCurrentPage

- 用户浏览到 `/{subject}/{category}/{itemId}` 时，AI 调用 `getCurrentPage` 应返回该页内容
- **验证**：访问页面 → AI Tab 发送"这一节讲了什么" → 确认 AI 引用了正确内容

#### 4.2 getOutline

- AI 调用 `getOutline` 通过 `getMultiSubjectOutline()` 遍历 `contentTree`，返回当前学年的全部可检索学科与板块；传 `crossYear=true` 时包含全部学年。

#### 4.3 getSection

- AI 调用 `getSection` 可通过 `subject/category/itemId` 复合路径读取任意科目的任意板块；只传 `sectionId` 时默认读取当前科目的 `detail` 板块。

#### 4.4 searchNotes

- AI 调用 `searchNotes(query)` 通过 `searchAllContent()` 检索全部学科中声明了 `search` 能力的板块，默认按当前学年过滤；返回的 `path` 可直接交给 `getSection`。

### Step 5：TypeScript 编译验证

```bash
pnpm check:registry
pnpm exec tsc --noEmit
```

确保 manifest 修改不引入类型错误。

合入内容后必须 `pnpm test:content`。内容缺图等问题不会阻塞 `pnpm build` / `pnpm test`，但必须在内容合入流程里单独拦下。

## 纯文档课件接入

新导入的课件如果只是一篇文档（没有例题 / 测验 / 动画），不要套详解那套三栏重布局。manifest 按下面写即可，渲染层会按 `capabilities` 推导 `layoutProfile`。

| 目标 | 怎么声明 | 推导出的档位 |
|------|----------|--------------|
| 可检索的纯文档（课件、纪要） | `type: 'document'` + 板块 `capabilities: ['search']` | `article`：单栏正文 + 目录 + 可折叠 AI 面板，无例题/测验 tab |
| 只读资料（考前模拟、真题扫描件） | `type: 'document'` + 板块 `capabilities: []`，并在板块上写 `layoutProfile: 'reference'` | `reference`：同 article 但隐藏右栏与划词 |
| 需要例题 / 测验 / 动画 | 在板块 `capabilities` 里加上 `examples` / `quiz` / `media` | 自动升为 `full` |

不必手写 `layoutProfile: 'article'`：有 `search`、没有 examples/quiz/media 时推导就是 `article`。空 `capabilities` 的板块若条目是 `document`，推导会变成 `article`（仍有 AI 面板）；考前模拟这类只读页必须显式标 `reference`（标准模板 `kaoqian-moni` / `shizhan-yanlian` 已标好）。

```typescript
{
  id: 'courseware',
  name: '课件',
  capabilities: ['search'],
  items: [
    { id: 'lec-01', title: '第一讲 · 细胞膜', type: 'document', status: 'done' },
  ],
},
```

标准板块用 `category('summary', items)` / `category('kaoqian-moni', items)` 即可，模板已带出对应档位。

## 产出规范

本 SOP 的产出是对 `lib/content-data/manifest.ts` 的修改（新增 items），无独立文件产出。

## AI 工具可达性验证

本 SOP 本身就是验证流程，无需额外验证步骤。

## 参考文件

- [lib/content-data/manifest.ts](../../lib/content-data/manifest.ts) — 操作目标
- [lib/content/loader.ts](../../lib/content/loader.ts) — 路径解析逻辑
- [lib/content/layoutProfile.ts](../../lib/content/layoutProfile.ts) — 布局档位推导
- [lib/ai/agent/tools/](../../lib/ai/agent/tools/) — AI 工具定义（22 个目录、21 个可注册工具，工具名全集见 `names.ts` 的 `STUDY_TOOL_NAMES`；公共再导出见 `index.ts`）
- [README.md](./README.md) — SOP 全局规范

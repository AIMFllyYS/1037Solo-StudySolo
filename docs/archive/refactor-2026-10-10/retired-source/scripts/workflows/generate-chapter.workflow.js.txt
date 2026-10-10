export const meta = {
  name: "generate-chapter",
  description: "为指定章节扇出 Sonnet 子智能体，量产每个小节的详尽笔记 + Manim 动画 + 可交互组件",
  whenToUse: "需要系统性生成某一章的全部学习内容时（传 args.chapterId，默认 ch01）",
  phases: [
    { title: "笔记", detail: "并行撰写各小节详尽原创笔记 (.md)" },
    { title: "动画与交互", detail: "并行产出 Manim 场景 (.py) 与交互组件 (.tsx)" },
  ],
};

// ── 仓库根（Write 工具需要绝对路径；用正斜杠避免转义）──────────────
const ROOT = "D:/new_project/Gailvlun";

// ── 各章作业配置。指定章节即量产；新章在此追加配置。────────────────
const CONFIG = {
  ch01: {
    title: "随机事件与概率",
    notes: [
      {
        sectionId: "1.2",
        title: "事件间的关系与运算",
        summary: "包含、相等、和、积、差、互斥、对立；运算律与德摩根定律；用集合语言刻画事件。",
        videoId: "ch01-1.2-ops",
        interactiveId: "ch01-1.2-venn",
        transcript: "概率论-第二节.txt",
      },
      {
        sectionId: "1.3",
        title: "频率与概率",
        summary: "频率的统计稳定性；概率的统计定义与公理化定义（非负性、规范性、可列可加性）；概率的基本性质。",
        videoId: "ch01-1.3-freq",
        interactiveId: "ch01-1.3-frequency",
        transcript: "概率论-第二节.txt",
      },
      {
        sectionId: "1.4",
        title: "古典概型与几何概型",
        summary: "等可能概型的计算框架与排列组合计数；几何概型与测度比；经典摸球、分配、会面问题。",
        videoId: "ch01-1.4-classical",
        interactiveId: "ch01-1.4-coins",
        transcript: "概率论-第三节.txt",
      },
      {
        sectionId: "1.5",
        title: "条件概率·乘法公式·全概率与贝叶斯公式",
        summary: "条件概率定义与直觉；乘法公式；样本空间的划分与全概率公式；贝叶斯公式与先验/后验思想。",
        videoId: "ch01-1.5-bayes",
        interactiveId: "ch01-1.5-bayes-lab",
        transcript: "概率论-第四节.txt",
      },
      {
        sectionId: "1.6",
        title: "事件的独立性",
        summary: "两事件独立的定义与判定；多事件相互独立与两两独立之别；独立性在系统可靠性中的应用。",
        videoId: "ch01-1.6-indep",
        interactiveId: "ch01-1.6-reliability",
        transcript: "概率论-第四节.txt",
      },
    ],
    interactives: [
      {
        id: "ch01-1.1-events",
        sectionId: "1.1",
        componentName: "SampleSpaceBuilder",
        file: "components/interactives/ch01/SampleSpaceBuilder.tsx",
        title: "样本空间构造器",
        concept: "点击骰子结果把样本点纳入事件 A / B，实时显示集合表示与 A∪B、A∩B 等。",
        ideas: "6 个骰子结果可点选归入 A 或 B；右侧实时显示 A、B 的集合 {…} 及并交差补结果；体现「事件=样本空间子集」。",
      },
      {
        id: "ch01-1.4-coins",
        sectionId: "1.4",
        componentName: "ClassicalProbLab",
        file: "components/interactives/ch01/ClassicalProbLab.tsx",
        title: "古典概型实验台",
        concept: "可选场景（掷两骰子之和 / 摸球），滑块调参，模拟大量试验并对比理论概率与频率。",
        ideas: "下拉切换场景；滑块设试验次数；柱状图展示各结果频率 vs 理论古典概率；显示有利事件数/总数的计数。",
      },
      {
        id: "ch01-1.5-bayes-lab",
        sectionId: "1.5",
        componentName: "BayesExplorer",
        file: "components/interactives/ch01/BayesExplorer.tsx",
        title: "贝叶斯·疾病检测探索器",
        concept: "调发病率(先验)、灵敏度、特异度，用面积/方块图直观显示后验 P(病|阳性)。",
        ideas: "三个滑块；用 100×100 或比例方块图把人群分 TP/FP/FN/TN；高亮「阳性中真患病」比例 = 后验；显示全概率与贝叶斯公式数值代入。",
      },
      {
        id: "ch01-1.6-reliability",
        sectionId: "1.6",
        componentName: "ReliabilityExplorer",
        file: "components/interactives/ch01/ReliabilityExplorer.tsx",
        title: "独立性与系统可靠性",
        concept: "串联/并联系统，拖动各元件可靠度滑块，实时算系统可靠度，体现独立事件乘法。",
        ideas: "切换串联/并联；2–3 个元件每个一个可靠度滑块；SVG 画电路；串联 R=∏p_i，并联 R=1-∏(1-p_i)；高亮工作/失效路径。",
      },
    ],
    videos: [
      {
        id: "ch01-1.2-ops",
        sectionId: "1.2",
        scene: "EventOperationsScene",
        file: "manim/chapters/ch01/scene_1_2_operations.py",
        title: "事件的关系与运算",
        concept: "维恩图动画依次展示 A∪B、A∩B、A−B、对立、德摩根律。",
        ideas: "两圆 A、B；逐步高亮并、交、差、补区域；最后动画演示 (A∪B)ᶜ = Aᶜ∩Bᶜ。",
      },
      {
        id: "ch01-1.3-freq",
        sectionId: "1.3",
        scene: "FrequencyStabilityScene",
        file: "manim/chapters/ch01/scene_1_3_frequency.py",
        title: "频率的稳定性",
        concept: "模拟抛硬币，折线显示正面频率随次数增大稳定趋于 0.5。",
        ideas: "坐标系 y=频率(0~1)，x=次数；动画画出频率折线在 0.5 处收敛；标注理论概率虚线。",
      },
      {
        id: "ch01-1.4-classical",
        sectionId: "1.4",
        scene: "ClassicalProbScene",
        file: "manim/chapters/ch01/scene_1_4_classical.py",
        title: "古典概型与计数",
        concept: "以掷两颗骰子为例，展示样本空间 6×6 网格与事件「点数和=7」的有利结果计数。",
        ideas: "6×6 点阵代表 36 个等可能结果；高亮和为 7 的 6 个格；显示 P=6/36=1/6。",
      },
      {
        id: "ch01-1.5-bayes",
        sectionId: "1.5",
        scene: "BayesScene",
        file: "manim/chapters/ch01/scene_1_5_bayes.py",
        title: "全概率与贝叶斯",
        concept: "用划分的树状/面积图展示全概率公式，再「反演」为贝叶斯公式。",
        ideas: "样本空间按 B1,B2,… 划分；树状图标条件概率；面积法展示 P(A)=ΣP(Bi)P(A|Bi)，再反推 P(Bi|A)。",
      },
      {
        id: "ch01-1.6-indep",
        sectionId: "1.6",
        scene: "IndependenceScene",
        file: "manim/chapters/ch01/scene_1_6_independence.py",
        title: "事件的独立性",
        concept: "对比独立与不独立：P(AB)=P(A)P(B) 的面积直观，及串/并联可靠性。",
        ideas: "用单位正方形面积表示独立时 P(AB)=P(A)P(B)；再画串联/并联系统可靠度公式。",
      },
    ],
  },
};

const RENDER_CONTRACT = `公式一律用 KaTeX：行内 $...$，独立 $$...$$，多行用 \\begin{aligned}...\\end{aligned}；禁止 \\( \\) 与 \\[ \\]。
富文本块用自定义指令（独占整段）：:::definition{label=…} / :::theorem{label=…} / :::example{label=…} / :::insight{label=…} / :::pitfall{label=…} / :::note{label=…} / :::derivation{label=…}（折叠推导），块以单独一行 ::: 结束。
内嵌动画/交互各占一行：::video{id=…} 与 ::interactive{id=…}。`;

function notePrompt(j) {
  return `你是《概率论与数理统计》课程的资深讲师与教辅作者。请为第一章「随机事件与概率」的小节 ${j.sectionId} ${j.title} 撰写一篇极其详细、通俗易懂、原创的学习讲义，并用 Write 工具写入文件：
${ROOT}/content/chapters/ch01/${j.sectionId}.md

本节主题：${j.summary}

【动手前务必】
1. Read 黄金范例 ${ROOT}/content/chapters/ch01/1.1.md，严格对齐其风格、深度与指令块用法（向它看齐或更深）。
2. Read ${ROOT}/docs/sop/02-detail-generation.md 的 §2「笔记写作合同」。
3. 可选：skim ${ROOT}/docs/${j.transcript} 中与本节相关段落，还原老师强调的重点/例子（次要，主体按标准教材写全）。

【渲染契约（务必遵守）】
${RENDER_CONTRACT}

【写作要求】（铁律：宁详尽勿潦草；读者是刚学完微积分/线代、怕公式的初学者）
- 结构：## 直觉/动机 → 定义(:::definition) → 为什么这样(:::insight) → 性质/定理(:::theorem，复杂推导放 :::derivation) → 2–4 个由浅入深例题(:::example，含完整解答与每步解释) → 易错点(:::pitfall) → 小结(:::note) 并衔接下一节。
- 在叙述最贴切处各插入一行：::video{id=${j.videoId}} 与 ::interactive{id=${j.interactiveId}}。
- 正文不少于 1800 字（复杂节更长）。全简体中文，不要出现"AI 生成"等字样。

【完成后】只用 Write 写该文件，不要运行 build/dev，不要改其它文件。然后返回结构化结果。`;
}

function interactivePrompt(k) {
  return `你是资深前端 + 数据可视化工程师。请创建一个真正可交互的教学可视化 React 组件，用 Write 写入：
${ROOT}/${k.file}

用途：第一章 ${k.sectionId} 节。主题：${k.concept}

【动手前务必】Read ${ROOT}/docs/sop/02-detail-generation.md 的 §3「交互组件合同」，并 Read 样板 ${ROOT}/components/interactives/ch01/VennPlayground.tsx 与 ${ROOT}/components/interactives/ch01/FrequencyConvergence.tsx，对齐风格与约束。

【硬约束】
- 文件首行 "use client";，默认导出名为 ${k.componentName} 的无 props 组件。
- 自包含：不发网络/不读外部数据；状态用 useState；随机性仅在事件处理函数内用 Math.random()。
- 仅依赖 react、framer-motion、clsx（按需）+ 内联 SVG。
- 设计令牌：主色 var(--accent)，文字 var(--ink)/var(--ink-soft)，描边 var(--line)，底 var(--bg-muted)；外层套 className="rounded-xl border border-[var(--line)] bg-white p-4"。
- 必须真可交互：按钮/滑块/点击/拖动，实时反映概率/计数/图形变化，揭示本节本质。
- TypeScript 严格通过（strict）：类型自洽、无未使用变量、不要 any。

【落地建议】${k.ideas}

【完成后】只用 Write 写该 .tsx；不要修改 registry.ts；不要运行 build。返回结构化结果（id=${k.id}, sectionId, componentName, file, title, description）。`;
}

function videoPrompt(v) {
  return `你是 Manim 动画作者。请创建一个 Manim 场景文件，用 Write 写入：
${ROOT}/${v.file}

用途：第一章 ${v.sectionId} 节。主题：${v.concept}

【动手前务必】Read ${ROOT}/docs/sop/02-detail-generation.md 的 §4「Manim 动画合同」，并 Read 样板 ${ROOT}/manim/chapters/ch01/scene_1_1_sample_space.py。

【硬约束】
- 定义 class ${v.scene}(Scene)，construct 内做 20–60s、循序渐进、有重点高亮的动画；画面不要堆满或重叠。
- 中文用 Text(..., font="Microsoft YaHei")；数学公式用 MathTex(r"...")（绝不在 MathTex 内写中文）。
- 文件顶层导出 REGISTER = [{ "scene": "${v.scene}", "id": "${v.id}", "chapterId": "ch01", "sectionId": "${v.sectionId}", "title": "${v.title}", "description": "一句话说明" }]。
- 只 import 需要的 manim 符号，确保可被 \`manim render\` 直接调用。

【落地建议】${v.ideas}

【完成后】只用 Write 写该 .py；不要运行渲染。返回结构化结果（id=${v.id}, sectionId, scene, file, title）。`;
}

const noteSchema = {
  type: "object",
  properties: {
    sectionId: { type: "string" },
    ok: { type: "boolean" },
    chars: { type: "number" },
    summary: { type: "string" },
  },
  required: ["sectionId", "ok"],
};
const interactiveSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    sectionId: { type: "string" },
    componentName: { type: "string" },
    file: { type: "string" },
    title: { type: "string" },
    description: { type: "string" },
    ok: { type: "boolean" },
  },
  required: ["id", "sectionId", "componentName", "file", "ok"],
};
const videoSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    sectionId: { type: "string" },
    scene: { type: "string" },
    file: { type: "string" },
    title: { type: "string" },
    ok: { type: "boolean" },
  },
  required: ["id", "sectionId", "scene", "file", "ok"],
};

// ── 主流程 ─────────────────────────────────────────────────────────
const chapterId = (args && args.chapterId) || "ch01";
const cfg = CONFIG[chapterId];
if (!cfg) {
  log(`未找到 ${chapterId} 的作业配置。请在 workflows/generate-chapter.workflow.js 的 CONFIG 中添加。`);
  return { error: `no config for ${chapterId}` };
}

log(`开始为 ${chapterId}《${cfg.title}》生成：笔记 ${cfg.notes.length}，交互 ${cfg.interactives.length}，动画 ${cfg.videos.length}`);

phase("笔记");
const notes = await parallel(
  cfg.notes.map((j) => () =>
    agent(notePrompt(j), {
      label: `笔记 ${j.sectionId}`,
      phase: "笔记",
      model: "sonnet",
      schema: noteSchema,
    }),
  ),
);

phase("动画与交互");
const [interactives, videos] = await Promise.all([
  parallel(
    cfg.interactives.map((k) => () =>
      agent(interactivePrompt(k), {
        label: `交互 ${k.sectionId} ${k.componentName}`,
        phase: "动画与交互",
        model: "sonnet",
        schema: interactiveSchema,
      }),
    ),
  ),
  parallel(
    cfg.videos.map((v) => () =>
      agent(videoPrompt(v), {
        label: `动画 ${v.sectionId} ${v.scene}`,
        phase: "动画与交互",
        model: "sonnet",
        schema: videoSchema,
      }),
    ),
  ),
]);

const clean = (a) => (a || []).filter(Boolean);
const result = {
  chapterId,
  notes: clean(notes),
  interactives: clean(interactives),
  videos: clean(videos),
};
log(
  `完成：笔记 ${result.notes.length}/${cfg.notes.length}，交互 ${result.interactives.length}/${cfg.interactives.length}，动画 ${result.videos.length}/${cfg.videos.length}`,
);
return result;

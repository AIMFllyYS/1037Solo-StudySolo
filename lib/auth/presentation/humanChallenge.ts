/**
 * 发邮件前的硬编码人机验证。任选一科答对即可。
 * 「其他」10 题里对 3 题即过；失败冷却由 UI 用 HUMAN_CHALLENGE_COOLDOWN_MS。
 */

export const HUMAN_CHALLENGE_COOLDOWN_MS = 10_000;
export const HUMANITIES_PICK_COUNT = 3;
export const OTHER_PASS_COUNT = 3;

export type ChallengeTrack = "science" | "humanities" | "medicine" | "other";

export const CHALLENGE_TRACKS: readonly { id: ChallengeTrack; label: string }[] = [
  { id: "science", label: "理科" },
  { id: "humanities", label: "文科" },
  { id: "medicine", label: "医科" },
  { id: "other", label: "其他" },
];

export interface ChoiceOption {
  id: string;
  label: string;
}

export interface ChoiceQuestion {
  id: string;
  prompt: string;
  choices: readonly ChoiceOption[];
}

export interface MedicineStep {
  id: string;
  title: string;
  caption: string;
}

export interface ScienceChallengePublic {
  track: "science";
  title: string;
  prompt: string;
  equation: string;
  condition: string;
  choices: readonly ChoiceOption[];
}

export interface HumanitiesChallengePublic {
  track: "humanities";
  title: string;
  hint: string;
  pick: number;
  questions: readonly ChoiceQuestion[];
}

export interface MedicineChallengePublic {
  track: "medicine";
  title: string;
  hint: string;
  steps: readonly MedicineStep[];
}

export interface OtherChallengePublic {
  track: "other";
  title: string;
  hint: string;
  passCount: number;
  questions: readonly ChoiceQuestion[];
}

export type ChallengePublic =
  | ScienceChallengePublic
  | HumanitiesChallengePublic
  | MedicineChallengePublic
  | OtherChallengePublic;

export type ChallengeAnswer =
  | { track: "science"; choiceId: string }
  | { track: "humanities"; selectedIds: string[]; answers: Record<string, string> }
  | { track: "medicine"; order: string[] }
  | { track: "other"; answers: Record<string, string> };

export interface ChallengeRevealItem {
  id: string;
  correct: boolean;
  expected: string;
  given: string;
}

export interface ChallengeGrade {
  passed: boolean;
  message: string;
  reveal: ChallengeRevealItem[];
}

const SCIENCE_CORRECT = "ode-x2-plus-1";

const SCIENCE: ScienceChallengePublic = {
  track: "science",
  title: "求解一道初值问题",
  prompt: "这是可分离的一阶方程。先两边积分，再用初值定常数。",
  equation: "dy/dx = 2x",
  condition: "y(0) = 1",
  choices: [
    { id: "ode-2x-plus-1", label: "y = 2x + 1" },
    { id: SCIENCE_CORRECT, label: "y = x² + 1" },
    { id: "ode-e2x", label: "y = e^{2x}" },
    { id: "ode-x2", label: "y = x²" },
  ],
};

const HUMANITIES_BANK: readonly (ChoiceQuestion & { answer: string })[] = [
  {
    id: "h1",
    prompt: "《共产党宣言》首次发表于哪一年？",
    choices: [
      { id: "a", label: "1789" },
      { id: "b", label: "1848" },
      { id: "c", label: "1871" },
      { id: "d", label: "1917" },
    ],
    answer: "b",
  },
  {
    id: "h2",
    prompt: "唯物辩证法的实质和核心是？",
    choices: [
      { id: "a", label: "质量互变规律" },
      { id: "b", label: "否定之否定规律" },
      { id: "c", label: "对立统一规律" },
      { id: "d", label: "社会存在决定社会意识" },
    ],
    answer: "c",
  },
  {
    id: "h3",
    prompt: "剩余价值的唯一源泉是？",
    choices: [
      { id: "a", label: "不变资本的周转" },
      { id: "b", label: "流通中的贱买贵卖" },
      { id: "c", label: "雇佣工人的剩余劳动" },
      { id: "d", label: "土地的自然肥力" },
    ],
    answer: "c",
  },
  {
    id: "h4",
    prompt: "「社会存在决定社会意识」属于哪一原理？",
    choices: [
      { id: "a", label: "唯心史观" },
      { id: "b", label: "唯物史观" },
      { id: "c", label: "机械决定论" },
      { id: "d", label: "实用主义" },
    ],
    answer: "b",
  },
  {
    id: "h5",
    prompt: "实践是检验真理的？",
    choices: [
      { id: "a", label: "主要标准之一" },
      { id: "b", label: "唯一标准" },
      { id: "c", label: "补充标准" },
      { id: "d", label: "理论标准" },
    ],
    answer: "b",
  },
  {
    id: "h6",
    prompt: "《资本论》第一卷的研究中心是？",
    choices: [
      { id: "a", label: "资本的流通过程" },
      { id: "b", label: "资本主义生产的总过程" },
      { id: "c", label: "资本的生产过程" },
      { id: "d", label: "世界市场的形成" },
    ],
    answer: "c",
  },
  {
    id: "h7",
    prompt: "「人民群众是历史的创造者」直接批判的是？",
    choices: [
      { id: "a", label: "劳动价值论" },
      { id: "b", label: "英雄史观" },
      { id: "c", label: "剩余价值学说" },
      { id: "d", label: "阶级斗争学说" },
    ],
    answer: "b",
  },
  {
    id: "h8",
    prompt: "否定之否定规律主要揭示事物发展的？",
    choices: [
      { id: "a", label: "螺旋式上升与波浪式前进" },
      { id: "b", label: "量变引起质变" },
      { id: "c", label: "主要矛盾与次要矛盾" },
      { id: "d", label: "经济基础决定上层建筑" },
    ],
    answer: "a",
  },
  {
    id: "h9",
    prompt: "马克思主义哲学的直接理论来源是？",
    choices: [
      { id: "a", label: "英法空想社会主义" },
      { id: "b", label: "英国古典政治经济学" },
      { id: "c", label: "德国古典哲学" },
      { id: "d", label: "法国启蒙思想" },
    ],
    answer: "c",
  },
  {
    id: "h10",
    prompt: "「全世界无产者，联合起来！」出自？",
    choices: [
      { id: "a", label: "《资本论》" },
      { id: "b", label: "《关于费尔巴哈的提纲》" },
      { id: "c", label: "《哥达纲领批判》" },
      { id: "d", label: "《共产党宣言》" },
    ],
    answer: "d",
  },
];

export const MEDICINE_CANONICAL_ORDER = [
  "replication",
  "transcription",
  "processing",
  "translation",
] as const;

const MEDICINE_STEPS: readonly MedicineStep[] = [
  { id: "replication", title: "复制", caption: "DNA → DNA" },
  { id: "transcription", title: "转录", caption: "DNA → RNA" },
  { id: "processing", title: "加工", caption: "pre-mRNA → mRNA" },
  { id: "translation", title: "翻译", caption: "mRNA → 肽链" },
];

const OTHER_BANK: readonly (ChoiceQuestion & { answer: string })[] = [
  {
    id: "o1",
    prompt: "非线性剪辑时间线上，I / O 通常表示？",
    choices: [
      { id: "a", label: "入点 / 出点" },
      { id: "b", label: "导入 / 导出工程" },
      { id: "c", label: "插入 / 覆盖轨道" },
      { id: "d", label: "调色 / 输出" },
    ],
    answer: "a",
  },
  {
    id: "o2",
    prompt: "三分法构图把画面分成？",
    choices: [
      { id: "a", label: "两等分" },
      { id: "b", label: "九宫格" },
      { id: "c", label: "黄金螺旋" },
      { id: "d", label: "对角线对切" },
    ],
    answer: "b",
  },
  {
    id: "o3",
    prompt: "HTTP 401 更准确地表示？",
    choices: [
      { id: "a", label: "资源不存在" },
      { id: "b", label: "服务器内部错误" },
      { id: "c", label: "未通过身份认证" },
      { id: "d", label: "请求超时" },
    ],
    answer: "c",
  },
  {
    id: "o4",
    prompt: "智能体里常说的 ReAct，指的是？",
    choices: [
      { id: "a", label: "只检索不生成" },
      { id: "b", label: "Reasoning + Acting 交替" },
      { id: "c", label: "只调用一次工具就结束" },
      { id: "d", label: "把上下文全部丢掉" },
    ],
    answer: "b",
  },
  {
    id: "o5",
    prompt: "剪辑里的 B-roll 主要用来？",
    choices: [
      { id: "a", label: "替代音频采样率" },
      { id: "b", label: "铺解说时的补充画面" },
      { id: "c", label: "导出时的封装格式" },
      { id: "d", label: "时间线的主音轨" },
    ],
    answer: "b",
  },
  {
    id: "o6",
    prompt: "引导线构图的作用是？",
    choices: [
      { id: "a", label: "把视线引向主体" },
      { id: "b", label: "提高快门速度" },
      { id: "c", label: "自动白平衡" },
      { id: "d", label: "压缩动态范围" },
    ],
    answer: "a",
  },
  {
    id: "o7",
    prompt: "要把工作区改动放进暂存区，Git 命令是？",
    choices: [
      { id: "a", label: "git commit" },
      { id: "b", label: "git push" },
      { id: "c", label: "git add" },
      { id: "d", label: "git clone" },
    ],
    answer: "c",
  },
  {
    id: "o8",
    prompt: "Agent 工具循环需要步数上限，主要是为了？",
    choices: [
      { id: "a", label: "让模型永远不调用工具" },
      { id: "b", label: "防止来回调用工具停不下来" },
      { id: "c", label: "关闭所有网络请求" },
      { id: "d", label: "强制每次只输出一张图" },
    ],
    answer: "b",
  },
  {
    id: "o9",
    prompt: "许多剪辑软件里 J / K / L 的经典含义是？",
    choices: [
      { id: "a", label: "倒放 / 暂停 / 正放" },
      { id: "b", label: "剪切 / 复制 / 粘贴" },
      { id: "c", label: "入点 / 标记 / 出点" },
      { id: "d", label: "撤销 / 重做 / 保存" },
    ],
    answer: "a",
  },
  {
    id: "o10",
    prompt: "把主体放在三分法交叉点，通常是为了？",
    choices: [
      { id: "a", label: "让画面更呆板对称" },
      { id: "b", label: "避开所有线条" },
      { id: "c", label: "获得更稳、更有张力的构图" },
      { id: "d", label: "强制使用长焦" },
    ],
    answer: "c",
  },
];

function publicQuestion(q: ChoiceQuestion & { answer: string }): ChoiceQuestion {
  return { id: q.id, prompt: q.prompt, choices: q.choices };
}

export function getChallengePublic(track: ChallengeTrack): ChallengePublic {
  if (track === "science") return SCIENCE;
  if (track === "humanities") {
    return {
      track: "humanities",
      title: "马克思主义经典题",
      hint: `从 10 题中任选 ${HUMANITIES_PICK_COUNT} 题作答，全对即过。`,
      pick: HUMANITIES_PICK_COUNT,
      questions: HUMANITIES_BANK.map(publicQuestion),
    };
  }
  if (track === "medicine") {
    return {
      track: "medicine",
      title: "中心法则",
      hint: "把打乱的过程按遗传信息流动顺序排好：复制 → 转录 → 加工 → 翻译。",
      steps: MEDICINE_STEPS,
    };
  }
  return {
    track: "other",
    title: "杂题速答",
    hint: `10 题里答对 ${OTHER_PASS_COUNT} 题即可。剪辑、构图、开发、智能体都有。`,
    passCount: OTHER_PASS_COUNT,
    questions: OTHER_BANK.map(publicQuestion),
  };
}

export function shuffleIds<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const next = items.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = next[i]!;
    next[i] = next[j]!;
    next[j] = tmp;
  }
  return next;
}

export function shuffleMedicineOrder(rng: () => number = Math.random): string[] {
  let order = shuffleIds([...MEDICINE_CANONICAL_ORDER], rng);
  if (isMedicineOrderCorrect(order)) {
    order = [...MEDICINE_CANONICAL_ORDER].reverse();
  }
  return order;
}

export function isMedicineOrderCorrect(order: readonly string[]): boolean {
  if (order.length !== MEDICINE_CANONICAL_ORDER.length) return false;
  return MEDICINE_CANONICAL_ORDER.every((id, index) => order[index] === id);
}

function choiceLabel(choices: readonly ChoiceOption[], id: string): string {
  return choices.find((choice) => choice.id === id)?.label ?? (id || "（未作答）");
}

function gradeScience(choiceId: string): ChallengeGrade {
  const given = choiceLabel(SCIENCE.choices, choiceId);
  const expected = choiceLabel(SCIENCE.choices, SCIENCE_CORRECT);
  const correct = choiceId === SCIENCE_CORRECT;
  return {
    passed: correct,
    message: correct ? "理科通过。可以发送邮件了。" : "这道初值问题还不对。",
    reveal: [{ id: "science", correct, expected, given }],
  };
}

function gradeHumanities(selectedIds: string[], answers: Record<string, string>): ChallengeGrade {
  const unique = [...new Set(selectedIds)];
  if (unique.length !== HUMANITIES_PICK_COUNT) {
    return {
      passed: false,
      message: `请任选 ${HUMANITIES_PICK_COUNT} 题作答。`,
      reveal: [],
    };
  }
  const reveal: ChallengeRevealItem[] = unique.map((id) => {
    const question = HUMANITIES_BANK.find((item) => item.id === id);
    if (!question) {
      return { id, correct: false, expected: "", given: answers[id] ?? "" };
    }
    const givenId = answers[id] ?? "";
    return {
      id,
      correct: givenId === question.answer,
      expected: choiceLabel(question.choices, question.answer),
      given: choiceLabel(question.choices, givenId),
    };
  });
  const passed = reveal.every((item) => item.correct);
  return {
    passed,
    message: passed ? "文科通过。可以发送邮件了。" : "选出的 3 题需要全部答对。",
    reveal,
  };
}

function gradeMedicine(order: string[]): ChallengeGrade {
  const passed = isMedicineOrderCorrect(order);
  const titleOf = (id: string) => MEDICINE_STEPS.find((step) => step.id === id)?.title ?? id;
  return {
    passed,
    message: passed ? "医科通过。中心法则顺序正确。" : "中心法则顺序还不对。",
    reveal: MEDICINE_CANONICAL_ORDER.map((id, index) => ({
      id,
      correct: order[index] === id,
      expected: `${index + 1}. ${titleOf(id)}`,
      given: order[index] ? `${index + 1}. ${titleOf(order[index]!)}` : "（空）",
    })),
  };
}

function gradeOther(answers: Record<string, string>): ChallengeGrade {
  const reveal = OTHER_BANK.map((question) => {
    const givenId = answers[question.id] ?? "";
    return {
      id: question.id,
      correct: givenId === question.answer,
      expected: choiceLabel(question.choices, question.answer),
      given: givenId ? choiceLabel(question.choices, givenId) : "（未作答）",
    };
  });
  const correctCount = reveal.filter((item) => item.correct).length;
  const passed = correctCount >= OTHER_PASS_COUNT;
  return {
    passed,
    message: passed
      ? `其他通过。答对 ${correctCount} / ${OTHER_BANK.length}。`
      : `还差，当前答对 ${correctCount} 题，需要 ${OTHER_PASS_COUNT} 题。`,
    reveal,
  };
}

export function gradeChallenge(answer: ChallengeAnswer): ChallengeGrade {
  if (answer.track === "science") return gradeScience(answer.choiceId);
  if (answer.track === "humanities") return gradeHumanities(answer.selectedIds, answer.answers);
  if (answer.track === "medicine") return gradeMedicine(answer.order);
  return gradeOther(answer.answers);
}

export function remainingCooldownMs(failedAtMs: number | null, nowMs: number): number {
  if (failedAtMs == null) return 0;
  return Math.max(0, HUMAN_CHALLENGE_COOLDOWN_MS - (nowMs - failedAtMs));
}

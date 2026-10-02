// 「这次提问是否需要联网」的判定。
//
// 用途：用户没手动开联网时，只要问题明显依赖外部/实时信息，就自动为本轮打开联网搜索
// （模型仍然自己决定要不要真的搜索、搜几家）。判定必须是**确定性的规则**，可测、可解释，
// 不能靠模型猜——因为"要不要开联网"决定了这一轮能不能拿到外部事实。

/**
 * 明显需要外部/实时信息的信号。
 * 保守取词：只认那些"没有联网就几乎必然答不准"的问法，避免日常闲聊也触发搜索（要花钱）。
 */
const NEEDS_SEARCH_RE = new RegExp(
  [
    // 时间性
    "今天|今日|昨天|明天|现在|目前最新|最新|实时|近期|最近|本周|本月|今年|明年",
    // 实时数据
    "天气|气温|汇率|股价|行情|比分|赛程|航班|列车|限号|营业时间|开放时间|快递",
    // 政策 / 发布 / 公告
    "政策|通知|公告|发布|上线|开售|上市|发售|更新日志|版本号|涨价|降价|票价|价格|多少钱|费用",
    // 显式要求检索
    "查一下|查查|搜一下|搜索一下|帮我查|去查|联网|查证|核实|是否属实|有没有这回事|求证",
    // 年份锚点（教材里不会有的未来/近年事实）
    "20(2[6-9]|3[0-9])\\s*年",
  ].join("|"),
  "i",
);

/** 学习场景里的常见问答不需要联网，即使含"最新"这类词也应排除（如"最新研究进展"其实是讲解）。 */
const EXPLAIN_ONLY_RE = /讲解|讲讲|是什么|为什么|怎么理解|推导|证明|复习|总结一下这一章/;
const EXPLICIT_IMAGE_SEARCH_RE = /imageSearch|图片检索|检索图片|搜索图片|搜图|联网图片/i;

export function shouldAutoEnableSearch(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // An explicit tool request takes precedence over the lecture/explanation
  // heuristic; otherwise the model is asked to use a tool it cannot see.
  if (EXPLICIT_IMAGE_SEARCH_RE.test(trimmed)) return true;
  // 太长的一般是"讲解/写作"类请求，交给模型按需调用即可，不必默认开联网。
  if (trimmed.length > 300) return false;
  if (!NEEDS_SEARCH_RE.test(trimmed)) return false;
  if (EXPLAIN_ONLY_RE.test(trimmed)) return false;
  return true;
}

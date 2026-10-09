/**
 * Agent 左栏的最简搜索：把用户输入转义成正则（不区分大小写、空白归一，多个词都要命中），
 * 不引入任何模糊/拼音库。
 */
export function buildSearchRegexes(query: string): RegExp[] {
  const terms = query.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  return terms.map((term) => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
}

/** 所有词都命中 text 才算匹配；空查询视为全部匹配。 */
export function matchesSearch(text: string | undefined | null, regexes: RegExp[]): boolean {
  if (regexes.length === 0) return true;
  const hay = (text ?? "").replace(/\s+/g, " ");
  return regexes.every((re) => re.test(hay));
}

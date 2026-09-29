/**
 * 课堂文稿检索打分（纯函数，服务端 Agent 工具与课堂前端共用）。
 *
 * 模型给出的查询往往是「可导 连续」「连续不一定可导 |x|」这种组合词，整串 includes
 * 在中文里几乎总是 0 命中。这里按词项 + 中文二元组打分：整词命中权重高，二元组重叠兜底。
 */
export interface TranscriptSegmentLike {
  id: string;
  seq: number;
  text: string;
}

export interface TranscriptHit {
  segmentId: string;
  seq: number;
  text: string;
}

export const TRANSCRIPT_MAX_HITS = 6;

function bigrams(text: string): Set<string> {
  const chars = [...text.replace(/\s+/g, "")];
  const grams = new Set<string>();
  for (let i = 0; i < chars.length - 1; i++) grams.add(chars[i] + chars[i + 1]);
  return grams;
}

export function rankTranscriptSegments(
  query: string,
  segments: readonly TranscriptSegmentLike[],
  limit = TRANSCRIPT_MAX_HITS,
): TranscriptHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const terms = needle
    .split(/[\s,，。、;；:：|/\\()（）「」“”"'!?！？与和及或]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (terms.length === 0) terms.push(needle);
  const queryGrams = bigrams(terms.join(""));
  return segments
    .map((segment) => {
      const text = segment.text.toLowerCase();
      let score = text.includes(needle) ? needle.length * 4 : 0;
      for (const term of terms) if (text.includes(term)) score += term.length * 2;
      if (queryGrams.size > 0) {
        const grams = bigrams(text);
        let overlap = 0;
        for (const g of queryGrams) if (grams.has(g)) overlap += 1;
        // 至少一半二元组重叠才算相关，避免「的是」这类高频字把无关段落拉进来。
        if (overlap / queryGrams.size >= 0.5) score += overlap;
      }
      return { segment, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.segment.seq - b.segment.seq)
    .slice(0, limit)
    .map(({ segment }) => ({ segmentId: segment.id, seq: segment.seq, text: segment.text }));
}

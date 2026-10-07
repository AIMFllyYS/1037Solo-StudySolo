/** 项目文件的硬上限：集中在这一处，解析、携带、工具目录都读它。 */
export const PROJECT_LIMITS = {
  /** 单文件解析上限（文本字节）。超过就只标 error，不影响同项目其它文件。 */
  MAX_TEXT_BYTES: 25 * 1024 * 1024,
  /** 单文件最多切多少片：再多对检索没帮助，只会把索引撑大。 */
  MAX_SLICES: 60,
  /** 单片最多字符数（按标题切完再二次窗口切时用）。 */
  MAX_SLICE_CHARS: 4800,
  /** 无标题文本的窗口大小与重叠。 */
  SLICE_CHARS: 2500,
  SLICE_OVERLAP: 200,
  /** 索引目录随请求体上行的上限（正文不上行）。 */
  MAX_CATALOG_BYTES: 64 * 1024,
  /** 一轮对话最多携带的切片正文字符数（与附件上下文同口径）。 */
  MAX_CARRY_CHARS: 48_000,
} as const;

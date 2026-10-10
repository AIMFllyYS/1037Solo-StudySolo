/** 服务端入参上限。与客户端约定对齐并留余量，避免卡死正常使用。 */
export const REQUEST_LIMITS = {
  /** 超过消息数量时先调用 AI 生成持久摘要，不能直接截掉较早消息。 */
  messages: 200,
  /** 正常一条消息不会超过个位数 part。 */
  parts: 64,
  /** 设置里手填的全局背景。 */
  globalContextChars: 32 * 1024,
  /** 客户端 MAX_SKILLS = 20。 */
  skills: 32,
  skillContentChars: 32 * 1024,
  /** #71 之后这里只会剩本次用到的那一个。 */
  customApiGroups: 32,
  /**
   * 旧附件内联预处理结果的传输保护。新原文件直传私有 Storage，每文件最多 25MB。
   */
  filePartChars: 12 * 1024 * 1024,
  /** 整包 JSON 字节上限，与客户端序列化硬顶对齐。 */
  requestBytes: 16 * 1024 * 1024,
  /** 单条 text part（含附件文档正文）上限。 */
  textPartChars: 128 * 1024,
  /** artifact / image-gen / record / canvas 的 prompt、instruction、text。 */
  satellitePromptChars: 32 * 1024,
  /** canvas HTML/SVG source；交互演示可比普通 prompt 大。 */
  canvasSourceChars: 256 * 1024,
  /** 长文档前文，服务端实际只取尾部 1200 字。 */
  documentPreviousMarkdownChars: 128 * 1024,
} as const;
// 动态提示词加载器（服务端）：把 MD 文件按 (科目) 拼装为唯一一条 system。
// 设计：global.md（含工具说明，几乎不变）+ subjects/<id>.md（按学科切换）= 稳定前缀，
// 利于上游 prefix 缓存命中；易变上下文（定位行 / 参考材料 / 演示目录）由 studyAgent
// 拼进同一条 system 的末尾，而不是另开一条消息（部分模型会拒第二条 system）。
import fs from "node:fs";
import path from "node:path";
import { getSubjectMeta, subjectName } from "@/lib/content-data/subjects.registry";
import { describeSubjectsByYear } from "@/lib/content-data/subjectsTable";
import { ACADEMIC_YEAR_LABELS, isAcademicYearId } from "@/lib/constants/academic-year";
import { isPageBoundContext, type ChatContext } from "@/lib/types/chat";

const PROMPT_ROOT = path.join(process.cwd(), "lib", "ai", "prompts");

/** 学科提示词文件：registry 可显式指定 promptFile，缺省约定为 subjects/{id}.md；文件不存在时 readMd 返回空串。 */
function subjectPromptFile(subjectId: string): string | undefined {
  const meta = getSubjectMeta(subjectId);
  if (!meta) return undefined;
  return meta.promptFile ?? `subjects/${meta.id}.md`;
}

const cache = new Map<string, string>();

function readMd(rel: string): string {
  // 生产环境 MD 不变 → 缓存；开发环境每次读，便于热编辑提示词。
  if (process.env.NODE_ENV === "production" && cache.has(rel)) {
    return cache.get(rel)!;
  }
  let text = "";
  try {
    text = fs.readFileSync(path.join(PROMPT_ROOT, rel), "utf8").trim();
  } catch {
    text = "";
  }
  if (process.env.NODE_ENV === "production") cache.set(rel, text);
  return text;
}

/**
 * 模型调度器提示词（服务端内部用，**不进用户可见的 system**）。
 * 自动路由会把候选模型的价格/上下文/实测耗时/擅长领域交给快速模型，让它只回一个别名。
 */
export function buildModelRouterPrompt(): string {
  return readMd("model-router.md");
}

/** 当前科目段：科目名 + 该科提示词（无则只有科目名）。 */
function subjectBlockOf(ctx: ChatContext): string {
  const subject = subjectName(ctx.subjectId);
  const subjectRel = subjectPromptFile(ctx.subjectId);
  const subjectMd = subjectRel ? readMd(subjectRel) : "";
  return subjectMd ? `当前科目：${subject}\n\n${subjectMd}` : `当前科目：${subject}`;
}

/**
 * 稳定 system 前缀：学科无关的 global 在前，通用正确性规范居中，
 * 当前科目名 + 学科 md 在后。换科目时失效从「当前科目」段起；
 * global 教学法段与 correctness 段可继续命中 prefix cache。
 */
export function buildSystemPrompt(ctx: ChatContext): string {
  // Agent 独立对话（没有绑定任何页面）：不注入任何一门科目（以前会默认带上「概率论与数理统计」），
  // 也不注入大纲——它需要了解课程 / 教材结构时，自己调用 getOutline / getSection / searchNotes 等工具去查。
  if (!isPageBoundContext(ctx)) {
    const globalUnbound = readMd("global.md")
      .replace(/\{subjectTable\}/g, describeSubjectsByYear({ includeOther: true, name: "full", joiner: "、" }))
      .replace(/「\{subjectName\}」/g, "")
      .replace(/\{subjectName\}/g, "各");
    const correctnessUnbound = readMd("correctness.md");
    const headUnbound = correctnessUnbound ? `${globalUnbound}\n\n---\n\n${correctnessUnbound}` : globalUnbound;
    return `${headUnbound}\n\n---\n\n当前没有绑定任何页面或科目。需要了解课程目录、教材内容或学生的笔记时，请主动调用工具（getOutline 看目录，getSection 读正文，searchNotes / searchFlashcards 查笔记和闪卡），不要假设学生正在学某一门课。`;
  }
  const subject = subjectName(ctx.subjectId);
  const global = readMd("global.md")
    .replace(/\{subjectTable\}/g, describeSubjectsByYear({ includeOther: true, name: "full", joiner: "、" }))
    .replace(/「\{subjectName\}」/g, "")
    .replace(/\{subjectName\}/g, subject);
  const correctness = readMd("correctness.md");
  const head = correctness ? `${global}\n\n---\n\n${correctness}` : global;
  return `${head}\n\n---\n\n${subjectBlockOf(ctx)}`;
}

/**
 * 笔记角色的稳定 system 前缀。
 *
 * 与教学 Agent **刻意不共用**：笔记 Agent 要的是短提纲体例与「先征得同意」的写入纪律，
 * 而 global.md 强制教学法（引导式反问、示范题、追问标签）会把聊天套话带回笔记。
 * 两边共用同一份 correctness.md（公式规范 + 防幻觉），避免正确性规范出现两份真相。
 *
 * 同科目内逐字节一致，同一篇笔记多轮对话可继续命中 prefix cache；
 * 笔记正文只出现在 volatile 段（见 studyAgent），不进这条前缀。
 */
export function buildNoteSystemPrompt(ctx: ChatContext): string {
  const noteAgent = readMd("note-agent.md");
  const correctness = readMd("correctness.md");
  const parts = [noteAgent, correctness].filter(Boolean);
  return `${parts.join("\n\n---\n\n")}\n\n---\n\n当前科目：${subjectName(ctx.subjectId)}`;
}

/*
 * 笔记前缀**不**拼 subjects/<id>.md：那 8 份是「讲解策略」，本体是教学口吻
 * （引导式提问、:::definition / :::timeline 体例），拼进来等于把教学人格从后门带回去。
 * 笔记需要的只是「当前是哪一科」，科目名一行足够；学科相关的事实与公式规范由 correctness.md 覆盖。
 */

/**
 * 当前定位行（轻量、易变，必须放在 system 末尾）。
 * 换页改 itemId/主题；换学年改学年字段。失效范围止于这一行及之后的参考材料。
 *
 * Agent 的通用对话不绑定页面（分类/内容项为空）：这时没有「当前位置」可言，
 * 整行不输出——否则会拼出「分类： ｜ 内容项：」这种残行，等于把空章节当成上下文。
 */
export function buildLocationLine(ctx: ChatContext): string {
  if (!isPageBoundContext(ctx)) return "";
  const year = isAcademicYearId(ctx.academicYear)
    ? ACADEMIC_YEAR_LABELS[ctx.academicYear]
    : ctx.academicYear;
  let s = "【当前位置】";
  if (year) s += `学年：${year} ｜ `;
  s += `科目：${subjectName(ctx.subjectId)} ｜ 分类：${ctx.categoryId} ｜ 内容项：${ctx.itemId}`;
  if (ctx.currentTopic) s += ` ｜ 主题：${ctx.currentTopic}`;
  return s;
}

/**
 * 插件市场数据模型与静态 manifest 拉取。
 *
 * 数据来源是仓库内的静态文件（public/plugins/market.json + public/skills/<id>/SKILL.md），
 * 不走后端表：Web 端与桌面端都能用相对路径直接取到。
 *
 * manifest 文案级 i18n：条目带 desc/descEn、notes/notesEn 等双语字段，
 * 界面按当前 locale 取词（pickL10n）；UI 框架文案仍走 lib/i18n 词典。
 */

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { MarketSection } from "./market-section";
import { connectorId, type ConnectorId } from "@/lib/connectors/registry";

export const MARKET_MANIFEST_URL = "/plugins/market.json";

// ── 类型 ─────────────────────────────────────────────────────────

// 分区类型在 ./market-section（server-safe，详情页路由也要用），这里转发出口径统一。
export type { MarketSection } from "./market-section";

interface EntryBase {
  /** 市场内唯一 id（详情页路由参数、skill 的 sourceId）。 */
  id: string;
  name: string;
  nameEn?: string;
  /** 一句话简介（卡片用）。 */
  tagline: string;
  taglineEn?: string;
  /** 详情页长描述。 */
  desc: string;
  descEn?: string;
  /** 推荐理由（详情页「为什么收录」）。 */
  notes?: string;
  notesEn?: string;
  version?: string;
  author?: string;
  /** 官方（source=official）或社区收录。 */
  source: "official" | "community";
  homepage?: string;
  docs?: string;
  tags: string[];
}

export interface McpEnvVar {
  /** env 变量名，如 GITHUB_PERSONAL_ACCESS_TOKEN。 */
  name: string;
  required: boolean;
  /** 用途说明（申请什么 key）。 */
  desc: string;
  descEn?: string;
  /** 申请/获取该凭证的入口链接。 */
  keyUrl?: string;
}

export interface McpEntry extends EntryBase {
  /** Native runtime binding; arbitrary catalog URLs never grant execution. */
  connector?: ConnectorId;
  section: "mcp";
  /** stdio = 本地命令拉起；http/sse = 远端服务直连。 */
  transport: "stdio" | "http" | "sse";
  /** stdio：启动命令与参数（env 键值放进 config.env）。 */
  command?: string;
  args?: string[];
  /** http/sse：远端 endpoint。 */
  url?: string;
  env?: McpEnvVar[];
}

export interface CliEntry extends EntryBase {
  section: "cli";
  /** cli = 命令行工具；skill-pack = 第三方 Agent skills 包/清单。 */
  kind: "cli" | "skill-pack";
  /** 一键复制的安装/获取命令。 */
  install?: string;
}

export interface SkillMarketEntry extends EntryBase {
  section: "skills";
  /** 仓库内静态路径，如 /skills/latex-formula-check/SKILL.md。 */
  path: string;
  runtime?: "cloud";
}

export type MarketEntry = McpEntry | CliEntry | SkillMarketEntry;

export interface MarketManifest {
  version: number;
  mcp: McpEntry[];
  cli: CliEntry[];
  skills: SkillMarketEntry[];
}

// ── 校验与归一化 ─────────────────────────────────────────────────

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
}

function normalizeBase(raw: Record<string, unknown>): EntryBase | null {
  const id = str(raw.id);
  const name = str(raw.name);
  const tagline = str(raw.tagline);
  const desc = str(raw.desc);
  if (!id || !name || !tagline || !desc) return null;
  return {
    id,
    name,
    nameEn: str(raw.nameEn),
    tagline,
    taglineEn: str(raw.taglineEn),
    desc,
    descEn: str(raw.descEn),
    notes: str(raw.notes),
    notesEn: str(raw.notesEn),
    version: str(raw.version),
    author: str(raw.author),
    source: raw.source === "official" ? "official" : "community",
    homepage: str(raw.homepage),
    docs: str(raw.docs),
    tags: strArray(raw.tags),
  };
}

function normalizeEnv(raw: unknown): McpEnvVar[] {
  if (!Array.isArray(raw)) return [];
  const out: McpEnvVar[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const name = str(r.name);
    if (!name) continue;
    out.push({
      name,
      required: r.required === true,
      desc: str(r.desc) ?? "",
      descEn: str(r.descEn),
      keyUrl: str(r.keyUrl),
    });
  }
  return out;
}

function normalizeEntry(section: MarketSection, raw: unknown): MarketEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const base = normalizeBase(r);
  if (!base) return null;
  if (section === "mcp") {
    const transport = r.transport === "http" || r.transport === "sse" ? r.transport : "stdio";
    return {
      ...base,
      section,
      transport,
      connector: connectorId(r.connector) ?? undefined,
      command: str(r.command),
      args: strArray(r.args),
      url: str(r.url),
      env: normalizeEnv(r.env),
    };
  }
  if (section === "cli") {
    return {
      ...base,
      section,
      kind: r.kind === "skill-pack" ? "skill-pack" : "cli",
      install: str(r.install),
    };
  }
  const path = str(r.path);
  if (!path) return null;
  return { ...base, section, path, ...(r.runtime === "cloud" ? { runtime: "cloud" as const } : {}) };
}

/** 宽松校验：坏条目丢弃而不是整个 manifest 判死（与 requestSchema 同口径）。 */
export function parseMarketManifest(raw: unknown): MarketManifest {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = (key: MarketSection) =>
    (Array.isArray(r[key]) ? r[key] : [])
      .map((item) => normalizeEntry(key, item))
      .filter((e): e is MarketEntry => e !== null);
  return {
    version: typeof r.version === "number" ? r.version : 1,
    mcp: pick("mcp") as McpEntry[],
    cli: pick("cli") as CliEntry[],
    skills: pick("skills") as SkillMarketEntry[],
  };
}

export function findMarketEntry(manifest: MarketManifest, section: MarketSection, id: string): MarketEntry | null {
  return manifest[section].find((e) => e.id === id) ?? null;
}

// ── 拉取（模块级缓存，列表页与详情页共用一次请求）───────────────

let manifestPromise: Promise<MarketManifest> | null = null;

export function fetchMarketManifest(): Promise<MarketManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch(MARKET_MANIFEST_URL, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`market manifest ${res.status}`);
        return res.json();
      })
      .then(parseMarketManifest)
      .catch((err) => {
        manifestPromise = null; // 失败允许下次重试
        throw err;
      });
  }
  return manifestPromise;
}

export interface MarketManifestState {
  manifest: MarketManifest | null;
  loading: boolean;
  error: boolean;
}

export function useMarketManifest(): MarketManifestState {
  const [state, setState] = useState<MarketManifestState>({ manifest: null, loading: true, error: false });
  useEffect(() => {
    let alive = true;
    fetchMarketManifest()
      .then((manifest) => {
        if (alive) setState({ manifest, loading: false, error: false });
      })
      .catch(() => {
        if (alive) setState({ manifest: null, loading: false, error: true });
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

// ── 文案与检索 ───────────────────────────────────────────────────

type L10nField = "name" | "tagline" | "desc" | "notes";
type L10nCarrier = Partial<Record<L10nField | `${L10nField}En`, string>>;

/** manifest 双语字段取值：英文优先取 *En，缺失回退中文字段。 */
export function pickL10n(entry: L10nCarrier, field: L10nField, locale: Locale): string {
  if (locale === "en") {
    const en = entry[`${field}En`];
    if (typeof en === "string" && en.trim()) return en;
  }
  return entry[field] ?? "";
}

/** 搜索：名称 + 简介 + 标签 + 作者，大小写不敏感。 */
export function filterMarketEntries(entries: MarketEntry[], query: string): MarketEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => {
    const hay = [e.id, e.name, e.nameEn ?? "", e.tagline, e.taglineEn ?? "", e.author ?? "", ...e.tags]
      .join("\n")
      .toLowerCase();
    return hay.includes(q);
  });
}

// ── MCP 配置导出 ─────────────────────────────────────────────────

/** `${ENV_NAME}` 占位符替换：args/url 里的凭证位（如 Postgres 连接串）也走同一套填写值。 */
function substituteSecrets(text: string, secretValues: Record<string, string>): string {
  return text.replace(/\$\{([A-Za-z_][\w]*)\}/g, (match, name: string) => {
    const value = secretValues[name]?.trim();
    return value || `<YOUR_${name}>`;
  });
}

/** secretValues：env 变量名 → 用户已填的真实值。缺失/空值回落为 `<YOUR_…>` 占位符。 */
export function buildMcpServerConfig(entry: McpEntry, secretValues: Record<string, string>): Record<string, unknown> {
  if (entry.transport !== "stdio") {
    const headers: Record<string, string> = {};
    for (const env of entry.env ?? []) {
      const value = secretValues[env.name]?.trim();
      headers[env.name] = value || `<YOUR_${env.name}>`;
    }
    return {
      type: entry.transport,
      url: substituteSecrets(entry.url ?? "", secretValues),
      ...(Object.keys(headers).length ? { headers } : {}),
    };
  }
  const env: Record<string, string> = {};
  for (const item of entry.env ?? []) {
    const value = secretValues[item.name]?.trim();
    env[item.name] = value || `<YOUR_${item.name}>`;
  }
  return {
    command: entry.command ?? "",
    args: (entry.args ?? []).map((arg) => substituteSecrets(arg, secretValues)),
    ...(Object.keys(env).length ? { env } : {}),
  };
}

/** 复制到剪贴板用的完整片段：{"mcpServers": {"<id>": {...}}}。 */
export function buildMcpConfigSnippet(entry: McpEntry, secretValues: Record<string, string>): string {
  return JSON.stringify({ mcpServers: { [entry.id]: buildMcpServerConfig(entry, secretValues) } }, null, 2);
}

/** MCP 条目里 env 还有没有缺的必填凭证（决定「复制配置」前的提示）。 */
export function missingRequiredEnv(entry: McpEntry, secretValues: Record<string, string>): McpEnvVar[] {
  return (entry.env ?? []).filter((e) => e.required && !secretValues[e.name]?.trim());
}

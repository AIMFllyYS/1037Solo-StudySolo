// 自定义上游 baseUrl 的基本 SSRF 防护：只允许 http(s)，拒绝回环与私网主机。
// 只看 URL 字面主机（含 Node 已规范化的 IPv4 写法），不做 DNS 解析。

import { BlockList, isIP } from "node:net";

export type UnsafeCustomBaseUrlReason = "invalid" | "protocol" | "private";

export class UnsafeCustomBaseUrlError extends Error {
  readonly reason: UnsafeCustomBaseUrlReason;

  constructor(reason: UnsafeCustomBaseUrlReason, message: string) {
    super(message);
    this.name = "UnsafeCustomBaseUrlError";
    this.reason = reason;
  }
}

const BLOCKED = new BlockList();
BLOCKED.addSubnet("0.0.0.0", 8, "ipv4");
BLOCKED.addSubnet("10.0.0.0", 8, "ipv4");
BLOCKED.addSubnet("100.64.0.0", 10, "ipv4");
BLOCKED.addSubnet("127.0.0.0", 8, "ipv4");
BLOCKED.addSubnet("169.254.0.0", 16, "ipv4");
BLOCKED.addSubnet("172.16.0.0", 12, "ipv4");
BLOCKED.addSubnet("192.168.0.0", 16, "ipv4");
BLOCKED.addAddress("::", "ipv6");
BLOCKED.addAddress("::1", "ipv6");
BLOCKED.addSubnet("fe80::", 10, "ipv6");
BLOCKED.addSubnet("fc00::", 7, "ipv6");
BLOCKED.addSubnet("ff00::", 8, "ipv6");

const LOOPBACK_NAMES = new Set([
  "localhost",
  "localhost6",
  "ip6-localhost",
  "ip6-loopback",
  "broadcasthost",
]);

/** 常见内网搜索域后缀：主机名打到 DHCP/搜索域时会落到内网。 */
const PRIVATE_HOST_SUFFIXES = [
  "localhost",
  "localhost6",
  "local",
  "internal",
  "lan",
  "home",
  "corp",
  "localdomain",
  "home.arpa",
];

/**
 * 把 IPv6 字面量展开成 16 字节数组；isIP()===6 已保证可解析，失败返回 null。
 */
function ipv6Bytes(ip: string): number[] | null {
  let input = ip;
  // 末尾的 dotted-quad（如 ::ffff:1.2.3.4）先换成两个 hex 组。
  const v4Tail = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(input);
  if (v4Tail) {
    const bytes = v4Tail[1].split(".").map((s) => parseInt(s, 10));
    if (bytes.some((b) => b > 255)) return null;
    input = `${input.slice(0, v4Tail.index)}${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
  }
  const halves = input.split("::");
  if (halves.length > 2) return null;
  const parseSide = (s: string): number[] | null => {
    if (!s) return [];
    const groups = s.split(":");
    const out: number[] = [];
    for (const g of groups) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const head = parseSide(halves[0]);
  const tail = halves.length === 2 ? parseSide(halves[1]) : [];
  if (!head || !tail) return null;
  const missing = 8 - head.length - tail.length;
  // 没有 "::" 时必须恰好 8 组；有 "::" 时缺省组补 0。
  if (halves.length === 1 ? missing !== 0 : missing < 0) return null;
  const groups = [...head, ...new Array(missing).fill(0), ...tail];
  const bytes: number[] = [];
  for (const g of groups) bytes.push(g >> 8, g & 0xff);
  return bytes.length === 16 ? bytes : null;
}

/**
 * IPv6 里内嵌的 IPv4 地址（绕过 v4 网段黑名单的常见写法）：
 *  - ::/96 IPv4-compatible（含 ::a.b.c.d，已弃用但仍可路由）
 *  - ::ffff:0:0/96 IPv4-mapped（::ffff:7f00:1 = 127.0.0.1）
 *  - 64:ff9b::/96 NAT64 well-known prefix
 *  - 2002::/16 6to4（v4 在字节 2–5）
 *  - 2001::/32 Teredo（客户端 v4 在末 4 字节，按位取反混淆）
 * 取不到内嵌 v4 返回 null（按 v6 网段规则判断）。
 */
export function embeddedIpv4FromV6(ip: string): string | null {
  const b = ipv6Bytes(ip);
  if (!b) return null;
  const at = (i: number) => `${b[i]}.${b[i + 1]}.${b[i + 2]}.${b[i + 3]}`;
  if (b.slice(0, 10).every((x) => x === 0)) {
    if (b[10] === 0xff && b[11] === 0xff) return at(12);
    if (b[10] === 0 && b[11] === 0) return at(12);
  }
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b &&
    b.slice(4, 12).every((x) => x === 0)) {
    return at(12);
  }
  if (b[0] === 0x20 && b[1] === 0x02) return at(2);
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0 && b[3] === 0) {
    return `${b[12] ^ 0xff}.${b[13] ^ 0xff}.${b[14] ^ 0xff}.${b[15] ^ 0xff}`;
  }
  return null;
}

export interface CustomBaseUrlCheckOk {
  ok: true;
  url: string;
}

export interface CustomBaseUrlCheckFail {
  ok: false;
  reason: UnsafeCustomBaseUrlReason;
  message: string;
}

export type CustomBaseUrlCheck = CustomBaseUrlCheckOk | CustomBaseUrlCheckFail;

function fail(reason: UnsafeCustomBaseUrlReason, message: string): CustomBaseUrlCheckFail {
  return { ok: false, reason, message };
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

function isBlockedIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return BLOCKED.check(address, "ipv4");
  if (version === 6) {
    if (BLOCKED.check(address, "ipv6")) return true;
    // v6 字面量内嵌 v4（mapped / compat / NAT64 / 6to4 / Teredo）：
    // 按内嵌的 v4 再查一次私网表，否则 [::ffff:7f00:1] 这类写法能绕过 v4 黑名单。
    const embedded = embeddedIpv4FromV6(address);
    if (embedded && BLOCKED.check(embedded, "ipv4")) return true;
    return false;
  }
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  if (!hostname) return true;
  // 合法 IP 只按网段判断；IPv6 不含点，不能走后面的单标签规则。
  if (isIP(hostname)) return isBlockedIp(hostname);
  if (LOOPBACK_NAMES.has(hostname)) return true;
  if (PRIVATE_HOST_SUFFIXES.some((s) => hostname === s || hostname.endsWith(`.${s}`))) return true;
  // 无点主机名通常走 DHCP 搜索域，落到内网。
  if (!hostname.includes(".")) return true;
  return false;
}

/** 校验自定义 baseUrl；合法时返回 trim 后的原字符串。 */
export function checkCustomBaseUrl(raw: string): CustomBaseUrlCheck {
  const url = raw.trim();
  if (!url) return fail("invalid", "自定义 API 地址格式无效");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return fail("invalid", "自定义 API 地址格式无效");
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    return fail("protocol", "自定义 API 地址仅支持 http 或 https 协议");
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname || isBlockedHostname(hostname)) {
    return fail("private", "自定义 API 地址不能指向回环或私网主机");
  }

  return { ok: true, url };
}

/** 合法则返回 trim 后的地址，否则抛出 UnsafeCustomBaseUrlError。 */
export function assertSafeCustomBaseUrl(raw: string): string {
  const result = checkCustomBaseUrl(raw);
  if (!result.ok) throw new UnsafeCustomBaseUrlError(result.reason, result.message);
  return result.url;
}

const NICKNAME_MAX_LENGTH = 40;

function emailLocalPart(email: string | null | undefined): string {
  return (email ?? "").split("@")[0]?.trim() ?? "";
}

/** 未改名时用邮箱 @ 前缀；再没有则「访客」。 */
export function defaultNickname(email: string | null | undefined): string {
  return emailLocalPart(email) || "访客";
}

export function resolveNickname(
  nickname: string | null | undefined,
  email: string | null | undefined,
): string {
  const trimmed = nickname?.trim() ?? "";
  return trimmed || defaultNickname(email);
}

/** 头像默认字：用户名第一个字符（Unicode 安全）。 */
export function avatarInitial(name: string | null | undefined): string {
  const first = Array.from((name ?? "").trim())[0];
  if (!first) return "我";
  return first.toUpperCase();
}

export function normalizeNickname(raw: string | null | undefined): string | null {
  const cleaned = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if ([...cleaned].length > NICKNAME_MAX_LENGTH) {
    throw new Error(`昵称最多 ${NICKNAME_MAX_LENGTH} 个字`);
  }
  if (/[\u0000-\u001f\u007f]/.test(cleaned)) {
    throw new Error("昵称包含无效字符");
  }
  return cleaned;
}

const MEMBERSHIP_LABELS = {
  free: "免费会员",
  plus: "Plus 会员",
  pro: "Pro 会员",
  pro_plus:"Pro+ 会员",
  ultra:"Ultra 会员",
} as const;

export type MembershipTier = keyof typeof MEMBERSHIP_LABELS;

export function membershipLabel(tier: string | null | undefined): string {
  if (tier === "plus" || tier === "pro" || tier === "pro_plus" || tier === "ultra" || tier === "free") return MEMBERSHIP_LABELS[tier];
  return MEMBERSHIP_LABELS.free;
}

import { NextResponse, type NextRequest } from "next/server";
import { resolveSessionUserId } from "@/lib/billing/quota/quotaGate";
import { listSharedConversations, saveSharedConversation, setSharedConversationEnabled } from "@/lib/share/server";
import { createShareId } from "@/lib/share/slug";
import { checkSharePayload, formatSharePayloadError } from "@/lib/share/snapshot";
import { shareUrl } from "@/lib/share/siteUrl";
import { isSharedConversationSnapshot, type SharedConversationSnapshot } from "@/lib/share/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };

/** 标题只作列表展示，超长截断而不是拒收。 */
const MAX_TITLE_LENGTH = 200;
/** sourceClientId 是会话 id 的量级，设上限是防止有人借这个字段往库里塞正文。 */
const MAX_CLIENT_ID_LENGTH = 128;
/** 兜底标题：刚建的对话标题可能是空串，公开页总得有个抬头。 */
const FALLBACK_TITLE = "未命名对话";

interface ShareRequestBody {
  sourceClientId: string;
  title: string;
  payload: SharedConversationSnapshot;
}

/**
 * 形状校验：只有「像一条分享」的请求才继续。
 * owner_id 与 id 都不从这里读——两者一律由服务端决定（见文件末尾的落库调用）。
 */
function parseShareBody(raw: unknown): ShareRequestBody | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  const sourceClientId = typeof body.sourceClientId === "string" ? body.sourceClientId.trim() : "";
  if (!sourceClientId || sourceClientId.length > MAX_CLIENT_ID_LENGTH) return null;
  if (typeof body.title !== "string") return null;
  if (!isSharedConversationSnapshot(body.payload)) return null;
  return { sourceClientId, title: body.title, payload: body.payload };
}

/** POST /api/share：把一条会话发布成公开只读链接。必须登录，链接永久有效（撤回接口另开）。 */
export async function POST(req: NextRequest) {
  const userId = await resolveSessionUserId(req.headers);
  if (!userId) {
    return NextResponse.json({ error: "请先登录后再分享对话。" }, { status: 401, headers });
  }

  const parsed = parseShareBody(await req.json().catch(() => null));
  if (!parsed) {
    return NextResponse.json({ error: "分享内容格式不正确。" }, { status: 400, headers });
  }

  const check = checkSharePayload(parsed.payload);
  if (!check.ok) {
    return NextResponse.json({ error: formatSharePayloadError(check) }, { status: 400, headers });
  }

  const id = createShareId();
  const title = (
    parsed.title.trim() ||
    parsed.payload.title.trim() ||
    FALLBACK_TITLE
  ).slice(0, MAX_TITLE_LENGTH);

  try {
    await saveSharedConversation({
      id,
      ownerId: userId,
      sourceClientId: parsed.sourceClientId,
      title,
      payload: parsed.payload,
    });
  } catch (error) {
    // 落库失败不能回 400：请求本身没错，重试可能就好了（redeem 那种「一律 400」在这里会误导用户）。
    console.error("[share] 保存分享失败:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "分享暂时不可用，请稍后重试。" }, { status: 503, headers });
  }

  return NextResponse.json({ id, url: shareUrl(id) }, { status: 201, headers });
}

/** GET /api/share：列出自己的分享链接（「我的资产 → 分享的链接」用）。必须登录。 */
export async function GET(req: NextRequest) {
  const userId = await resolveSessionUserId(req.headers);
  if (!userId) {
    return NextResponse.json({ error: "请先登录后再查看分享链接。" }, { status: 401, headers });
  }
  try {
    return NextResponse.json({ shares: await listSharedConversations(userId) }, { status: 200, headers });
  } catch (error) {
    console.error("[share] 读取分享列表失败:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "分享暂时不可用，请稍后重试。" }, { status: 503, headers });
  }
}

/** PATCH /api/share：开 / 关某条分享。关闭 = 置 revoked_at，链接立刻打不开。 */
export async function PATCH(req: NextRequest) {
  const userId = await resolveSessionUserId(req.headers);
  if (!userId) {
    return NextResponse.json({ error: "请先登录后再管理分享链接。" }, { status: 401, headers });
  }
  const raw = (await req.json().catch(() => null)) as { id?: unknown; enabled?: unknown } | null;
  const id = raw && typeof raw.id === "string" ? raw.id.trim() : "";
  const enabled = raw && typeof raw.enabled === "boolean" ? raw.enabled : null;
  if (!id || id.length > 64 || enabled === null) {
    return NextResponse.json({ error: "请求格式不正确。" }, { status: 400, headers });
  }
  try {
    const ok = await setSharedConversationEnabled(userId, id, enabled);
    if (!ok) {
      return NextResponse.json({ error: "找不到这条分享。" }, { status: 404, headers });
    }
    return NextResponse.json({ ok: true }, { status: 200, headers });
  } catch (error) {
    console.error("[share] 更新分享状态失败:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "分享暂时不可用，请稍后重试。" }, { status: 503, headers });
  }
}

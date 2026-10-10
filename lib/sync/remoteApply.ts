import { getOwnerEpoch, getStorageOwner } from "@/lib/storage/ownerScope";
import { hasExternalBody } from "@/lib/assets/body";
import { hydrateRemotePayload } from "@/lib/assets/client";
import type { ImageGenSession } from "@/lib/stores/imageGen";
import { ownerStillCurrent } from "./ownership";
import { isSessionStreaming } from "./streamingSessions";
import { isRemoteNewer, mergeChatSessionPayloads } from "./merge";
import { asChatPayload, asArtifact, asDocument, asUserNote, asReviewCard, asChatProject } from "./payloadReaders";
import type { CloudSyncStores } from "./storeAdapterTypes";
import type { CloudSyncKind, SyncDocumentRow } from "./types";
export interface RemoteApplyContext {
  readonly stores: CloudSyncStores;
  isDirty: (kind: CloudSyncKind, id: string) => boolean;
  baselineFor: (kind: CloudSyncKind, id: string) => string | undefined;
  onMerged: () => void;
}
export async function applyRemoteRow(context: RemoteApplyContext, row: SyncDocumentRow): Promise<'skipped'|void> {
  const owner=getStorageOwner(),epoch=getOwnerEpoch();
  // An uncommitted local replacement is authoritative until resolved. In-flight
  // and blocked jobs count as dirty too; refreshing cannot undo either edit/delete.
  const dirty = () => context.isDirty(row.kind, row.client_id);
  if (dirty()) return 'skipped';
  if (row.kind === 'chat-session' && isSessionStreaming(row.client_id)) return 'skipped';
  const appliedBaseline=context.baselineFor(row.kind, row.client_id);if(!row.deleted&&appliedBaseline&&!isRemoteNewer(row.updated_at,appliedBaseline))return;
  if(!row.deleted&&hasExternalBody(row.payload)&&context.stores.applyCloudHead?.(row))return;
  if (!row.deleted && hasExternalBody(row.payload)) row = { ...row, payload: await hydrateRemotePayload(row.kind, row.client_id,row.revision) };
  if(!ownerStillCurrent(owner,epoch)||dirty()||(row.kind==='chat-session'&&isSessionStreaming(row.client_id)))return 'skipped';
  if (row.deleted) {
    if (row.kind === "chat-session") await context.stores.forgetSession(row.client_id);
    else if (row.kind === "artifact") context.stores.forgetArtifact(row.client_id);
    else if (row.kind === "document") context.stores.forgetDocument(row.client_id);
    else if (row.kind === "user-note") context.stores.forgetNote(row.client_id);
    else if (row.kind === "review-card") context.stores.forgetCard(row.client_id);
    else if(row.kind==='image-gen')context.stores.forgetImage?.(row.client_id);
    else context.stores.forgetProject(row.client_id);
    return;
  }
  // 远端版本未前进（周期拉取里占绝大多数）：整行跳过，
  // 尤其对 chat-session 免去全量装配 + 合并 + v3 全量重写。
  const known = context.baselineFor(row.kind, row.client_id);
  if (known && !isRemoteNewer(row.updated_at, known)) return;
  if(row.kind==='image-gen'){await context.stores.applyImage?.(row.payload as ImageGenSession);return;}
  if (row.kind === "chat-session") {
    const remote = asChatPayload(row.payload);
    if (!remote) return;
    const local = await context.stores.loadSession(remote.meta.id);
    if(dirty() || !ownerStillCurrent(owner,epoch))return 'skipped';
    if(row.revision!==undefined){await context.stores.applySession(remote);return;}
    if (local) {
      const merged = mergeChatSessionPayloads(
        { v: 1, meta: local.meta, messages: local.messages },
        remote,
      );
      // 字节相等短路：合并结果与本地一致时跳过全量落盘 + 窗口/派生重算。
      if (JSON.stringify(merged.payload) !== JSON.stringify({ v: 1, meta: local.meta, messages: local.messages })) {
        await context.stores.applySession(merged.payload);
      }
      if (merged.added > 0) context.onMerged();
    } else {
      await context.stores.applySession(remote);
    }
    return;
  }
  if (row.kind === "artifact") {
    const artifact = asArtifact(row.payload);
    if (artifact) await context.stores.applyArtifact(artifact);
    return;
  }
  if (row.kind === "document") {
    const doc = asDocument(row.payload);
    if (doc) await context.stores.applyDocument(doc);
    return;
  }
  if (row.kind === "user-note") {
    const note = asUserNote(row.payload);
    if (!note) return;
    const local = context.stores.getNote(row.client_id);
    if (row.revision===undefined && local && local.updatedAt > note.updatedAt) return;
    context.stores.applyNote(note);
    return;
  }
  if (row.kind === "review-card") {
    const card = asReviewCard(row.payload);
    if (card) context.stores.applyCard(card);
    return;
  }
  const project = asChatProject(row.payload);
  if (!project) return;
  const localProject = context.stores.getProject(row.client_id);
  if (row.revision===undefined && localProject && localProject.updatedAt > project.updatedAt) return;
  context.stores.applyProject(project);
}

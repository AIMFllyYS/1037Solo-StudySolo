import { getOwnerEpoch, getStorageOwner } from "@/lib/storage/ownerScope";
import { deleteSessionData, isSystemProject, listBlobIdsForSession, loadSessionMessages, manifestFrom, saveManifest, saveManifestCommitted, saveSessionMessagesCommitted, type ChatFolder, type SessionMeta } from "@/lib/storage/chatStorage";
import { loadArtifactFull, persistArtifactBody, useArtifacts, type Artifact } from "@/lib/stores/artifacts";
import { applyCloudSessionWindow, ensureChatHistoryBootstrap, useChatHistory } from "@/lib/stores/chatHistory";
import { loadDocumentFull, persistDocumentBody, useDocuments } from "@/lib/stores/documents";
import { useUserNotes } from "@/lib/stores/userNotes";
import { useReviewCards } from "@/lib/stores/reviewCards";
import { useImageGen, loadImageGenSessionFull, applyCloudImageSession, type ImageGenSession } from "@/lib/stores/imageGen";
import type { StoredDocument } from "@/lib/documents/types";
import type { UserNote } from "@/lib/notes/userNote";
import type { ReviewCard } from "@/lib/review/types";
import { htmlToSummary } from "@/lib/context/compactArtifacts";
import { beginCloudSyncApply, endCloudSyncApply } from "./schedule";
import { ownerStillCurrent } from "./ownership";
import type { ChatProjectSyncPayload, ChatSessionSyncPayload } from "./types";
import type { CloudSyncStores } from "./storeAdapterTypes";
const MAX_LOCAL_SESSIONS = 50;

export function createDefaultStores(): CloudSyncStores {
  return {
    hasCloudRevision: (kind, id) => {
      if (kind === "artifact") return useArtifacts.getState().byId[id]?.cloudRevision !== undefined;
      if (kind === "document") return useDocuments.getState().byId[id]?.cloudRevision !== undefined;
      if (kind === "image-gen") return useImageGen.getState().sessions[id]?.cloudRevision !== undefined;
      return false;
    },
    applyCloudHead:row=>{
      const payload=row.payload as Record<string,unknown>;
      if(row.kind==='artifact'){useArtifacts.setState(state=>({order:state.order.includes(row.client_id)?state.order:[...state.order,row.client_id],byId:{...state.byId,[row.client_id]:{...payload,id:row.client_id,html:'',status:'done',bodyRef:true,cloudRevision:row.revision} as Artifact}}));return true;}
      if(row.kind==='document'){useDocuments.setState(state=>({byId:{...state.byId,[row.client_id]:{...payload,id:row.client_id,bodyRef:true,cloudRevision:row.revision} as unknown as StoredDocument}}));return true;}
      if(row.kind==='image-gen'){useImageGen.setState(state=>({sessions:{...state.sessions,[row.client_id]:{...payload,id:row.client_id,images:[],bodyRef:true,cloudRevision:row.revision} as unknown as ImageGenSession}}));return true;}
      return false;
    },
    listImageIds:()=>Object.keys(useImageGen.getState().sessions),getImage:loadImageGenSessionFull,applyImage:applyCloudImageSession,
    forgetImage:id=>withLocalApply(()=>useImageGen.setState(state=>{const sessions={...state.sessions};delete sessions[id];return {sessions};})),
    listSessionMetas: () => useChatHistory.getState().sessionsMeta,
    async loadSession(id) {
      const meta = useChatHistory.getState().sessionsMeta.find((item) => item.id === id);
      if (!meta) return null;
      // 窗口化后 messagesById 只是尾部窗口，上行 payload 必须全量装配，
      // 否则云端拿到的就是「只剩最近几轮」的截断会话。
      const messages = (await loadSessionMessages(id)) ?? [];
      return { meta, messages };
    },
    applySession: applyChatPayloadToZustand,
    forgetSession: forgetLocalSessionInZustand,
    listArtifactIds: () => useArtifacts.getState().order,
    getArtifact: loadArtifactFull,
    applyArtifact: applyArtifactToZustand,
    forgetArtifact: forgetArtifactInZustand,
    listDocumentIds: () => Object.keys(useDocuments.getState().byId),
    getDocument: loadDocumentFull,
    applyDocument: applyDocumentToZustand,
    forgetDocument: forgetDocumentInZustand,
    listNoteIds: () => useUserNotes.getState().order,
    getNote: (id) => useUserNotes.getState().byId[id] ?? null,
    applyNote: applyNoteToZustand,
    forgetNote: forgetNoteInZustand,
    listCardIds: () => useReviewCards.getState().order,
    getCard: (id) => useReviewCards.getState().byId[id] ?? null,
    applyCard: applyCardToZustand,
    forgetCard: forgetCardInZustand,
    listProjectIds: () => useChatHistory.getState().folders.map((folder) => folder.id),
    getProject: (id) => {
      const folder = useChatHistory.getState().folders.find((item) => item.id === id);
      if (!folder) return null;
      return {
        id: folder.id,
        name: folder.name,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt ?? folder.createdAt,
        ...(folder.system ? { system: folder.system } : {}),
      };
    },
    applyProject: applyProjectToZustand,
    forgetProject: forgetProjectInZustand,
  };
}

function withLocalApply(fn: () => void): void {
  beginCloudSyncApply();
  try {
    fn();
  } finally {
    endCloudSyncApply();
  }
}

function capSessions(metas: SessionMeta[]): SessionMeta[] {
  if (metas.length <= MAX_LOCAL_SESSIONS) return metas;
  return [...metas].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_LOCAL_SESSIONS);
}

async function applyChatPayloadToZustand(payload: ChatSessionSyncPayload): Promise<void> {
  // 先等本地水合：未水合时 sessionsMeta 是空的，据此写 manifest 会把盘上真实的会话列表
  // 覆盖成「只剩云端这一条」。等水合完再合并，顺带也保证拉取不会白跑。
  await ensureChatHistoryBootstrap().catch(() => {});
  const { meta, messages } = payload;
  const initial = useChatHistory.getState();
  if (!initial._hasHydrated) throw new Error("chat_history_not_hydrated");
  const ownerId = getStorageOwner(), epoch = getOwnerEpoch();
  await saveSessionMessagesCommitted(meta.id, messages);
  if (!ownerStillCurrent(ownerId, epoch)) throw new Error("sync_owner_changed");
  const state = useChatHistory.getState();
  const sessionsMeta = capSessions([meta, ...state.sessionsMeta.filter((item) => item.id !== meta.id)]);
  // The page checkpoint advances only after both content and its manifest are durable.
  await saveManifestCommitted(manifestFrom(state, { activeSessionId: state.activeSessionId ?? meta.id, sessions: sessionsMeta }));
  if (!ownerStillCurrent(ownerId, epoch)) throw new Error("sync_owner_changed");
  withLocalApply(() => applyCloudSessionWindow(meta, messages, sessionsMeta));
}

async function forgetLocalSessionInZustand(id: string): Promise<void> {
  // 同上：等水合完再按本地真实列表重写 manifest。
  await ensureChatHistoryBootstrap().catch(() => {});
  const ownerId = getStorageOwner(), epoch = getOwnerEpoch();
  const blobIds = await listBlobIdsForSession(id);
  if (!ownerStillCurrent(ownerId, epoch)) throw new Error("sync_owner_changed");
  await deleteSessionData(id, blobIds);
  if (!ownerStillCurrent(ownerId, epoch)) throw new Error("sync_owner_changed");
  const before = useChatHistory.getState();
  if (!before._hasHydrated) throw new Error("chat_history_not_hydrated");
  const retained = before.sessionsMeta.filter((item) => item.id !== id);
  const nextActive = before.activeSessionId === id ? retained[0]?.id ?? null : before.activeSessionId;
  await saveManifestCommitted(manifestFrom(before, { activeSessionId: nextActive, sessions: retained }));
  if (!ownerStillCurrent(ownerId, epoch)) throw new Error("sync_owner_changed");
  withLocalApply(() => {
    const state = useChatHistory.getState();
    if (!state._hasHydrated) return;
    const sessionsMeta = state.sessionsMeta.filter((item) => item.id !== id);
    const messagesById = { ...state.messagesById };
    delete messagesById[id];
    const sessionWindowById = { ...state.sessionWindowById };
    delete sessionWindowById[id];
    const sessionLoadState = { ...state.sessionLoadState };
    delete sessionLoadState[id];
    const deletedActive = state.activeSessionId === id;
    const activeSessionId = deletedActive ? sessionsMeta[0]?.id ?? null : state.activeSessionId;
    useChatHistory.setState({
      sessionsMeta,
      messagesById,
      sessionWindowById,
      sessionLoadState,
      activeSessionId,
      loadedSessionIds: state.loadedSessionIds.filter((item) => item !== id),
    });
  });
}

async function applyArtifactToZustand(artifact: Artifact): Promise<void> {
  const ownerId = getStorageOwner(), epoch = getOwnerEpoch();
  if (!await persistArtifactBody(artifact)) throw new Error("artifact_body_checkpoint_failed");
  if (!ownerStillCurrent(ownerId, epoch)) throw new Error("sync_owner_changed");
  withLocalApply(() => {
    useArtifacts.setState((state) => ({
      byId: { ...state.byId, [artifact.id]: { ...artifact, bodyRef: true, html: "", summary: artifact.summary ?? htmlToSummary(artifact.html) } },
      order: state.order.includes(artifact.id) ? state.order : [...state.order, artifact.id],
    }));
  });
}

function forgetArtifactInZustand(id: string): void {
  withLocalApply(() => {
    useArtifacts.setState((state) => {
      const byId = { ...state.byId };
      delete byId[id];
      return { byId, order: state.order.filter((item) => item !== id) };
    });
  });
}

async function applyDocumentToZustand(doc: StoredDocument): Promise<void> {
  const ownerId = getStorageOwner(), epoch = getOwnerEpoch();
  if (!await persistDocumentBody(doc)) throw new Error("document_body_checkpoint_failed");
  if (!ownerStillCurrent(ownerId, epoch)) throw new Error("sync_owner_changed");
  withLocalApply(() => {
    useDocuments.setState((state) => ({
      byId: { ...state.byId, [doc.id]: { ...doc, bodyRef: true, sections: doc.sections.map((section) => ({ ...section, markdown: undefined })) } },
    }));
  });
}

function forgetDocumentInZustand(id: string): void {
  withLocalApply(() => {
    useDocuments.setState((state) => {
      const byId = { ...state.byId };
      delete byId[id];
      return { byId };
    });
  });
}

function applyNoteToZustand(note: UserNote): void {
  withLocalApply(() => {
    useUserNotes.setState((state) => ({
      byId: { ...state.byId, [note.id]: note },
      order: state.order.includes(note.id) ? state.order : [...state.order, note.id],
    }));
  });
}

function forgetNoteInZustand(id: string): void {
  withLocalApply(() => {
    useUserNotes.setState((state) => {
      const byId = { ...state.byId };
      delete byId[id];
      const noteAgentSessionById = { ...state.noteAgentSessionById };
      delete noteAgentSessionById[id];
      return {
        byId,
        order: state.order.filter((item) => item !== id),
        openEditorIds: state.openEditorIds.filter((item) => item !== id),
        noteAgentOpenIds: state.noteAgentOpenIds.filter((item) => item !== id),
        noteAgentSessionById,
        agentEditingNoteId: state.agentEditingNoteId === id ? null : state.agentEditingNoteId,
      };
    });
  });
}

function applyProjectToZustand(project: ChatProjectSyncPayload): void {
  withLocalApply(() => {
    useChatHistory.setState((state) => {
      const existing = state.folders.find((folder) => folder.id === project.id);
      const next: ChatFolder = {
        id: project.id,
        name: project.name,
        createdAt: existing?.createdAt ?? project.createdAt,
        updatedAt: project.updatedAt,
        ...(project.system ? { system: project.system } : {}),
      };
      const folders = existing
        ? state.folders.map((folder) => (folder.id === project.id ? next : folder))
        : [...state.folders, next];
      saveManifest(manifestFrom(state, { folders }));
      return { folders };
    });
  });
}

function forgetProjectInZustand(id: string): void {
  withLocalApply(() => {
    useChatHistory.setState((state) => {
      const target = state.folders.find((folder) => folder.id === id);
      // 系统项目不跟着云端 tombstone 消失：成员由 kind 决定，本地必须留着。
      if (!target || isSystemProject(target)) return state;
      const folders = state.folders.filter((folder) => folder.id !== id);
      const sessionsMeta = state.sessionsMeta.map((s) =>
        s.folderId === id ? { ...s, folderId: null } : s,
      );
      saveManifest(
        manifestFrom(state, {
          sessions: sessionsMeta,
          folders,
          activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        }),
      );
      return {
        folders,
        sessionsMeta,
        activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
      };
    });
  });
}

function applyCardToZustand(card: ReviewCard): void {
  withLocalApply(() => {
    useReviewCards.setState((state) => ({
      byId: { ...state.byId, [card.id]: card },
      order: state.order.includes(card.id) ? state.order : [...state.order, card.id],
    }));
  });
}

function forgetCardInZustand(id: string): void {
  withLocalApply(() => {
    useReviewCards.setState((state) => {
      const byId = { ...state.byId };
      delete byId[id];
      return { byId, order: state.order.filter((item) => item !== id) };
    });
  });
}

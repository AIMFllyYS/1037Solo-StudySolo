"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, ExternalLink, FolderOpen, PenLine, Quote, Trash2 } from "lucide-react";
import NoteRenderer from "@/components/notes/NoteRenderer";
import FlipCard from "@/components/review/FlipCard";
import { AssetKindIcon } from "./AgentAssetCard";
import { useAgentAssets } from "@/lib/hooks/useAgentAssets";
import { useMinimumSkeleton } from "@/lib/hooks/useMinimumSkeleton";
import { useUserNotes } from "@/lib/stores/userNotes";
import { useReviewCards } from "@/lib/stores/reviewCards";
import { acquireDocumentBodyLease, hydrateDocumentBody, loadDocumentFull, useDocuments } from "@/lib/stores/documents";
import { useArtifacts } from "@/lib/stores/artifacts";
import { acquireArtifactBodyLease, hydrateArtifactBody, loadArtifactFull } from "@/lib/stores/artifacts";
import { captureStorageOperation, getOwnerEpoch } from '@/lib/storage/ownerScope';
import { useImports } from "@/lib/stores/imports";
import { isElectronDesktop } from "@/lib/stores/apiSecrets";
import { copyTextToClipboard } from "@/lib/clipboard/copyText";
import { openNoteEditor, citeUserNoteToMainAgent } from "@/lib/notes/openUserNote";
import { openSourcePreview } from "@/lib/chat/openSourcePreview";
import { openHtmlInNewTab } from "@/lib/utils/openHtmlInNewTab";
import { ARTIFACT_IFRAME_SANDBOX, injectOpaqueOriginStorageShim } from "@/lib/sandbox/opaqueOriginStorageShim";
import { assembleDocumentMarkdown } from "@/lib/documents/types";
import { ASSET_LIST_HREF } from "@/lib/agent/assetHref";
import { ASSET_KIND_LABELS, formatAssetSize, formatAssetTime, type AssetKind } from "@/lib/agent/assetCatalog";
import CloudFileDetail from './CloudFileDetail';
import ActionButton, { actionClass } from '@/components/ui/ActionButton';
import { PageShell } from '@/components/ui/PageChrome';
import { useFileLibrary } from '@/lib/files/library';
import {openAttachmentPreview} from '@/lib/chat/openAttachmentPreview';
import {removeLocalSource} from '@/lib/local-files/client';
import {useChatHistory} from '@/lib/stores/chatHistory';
import {useChatUI} from '@/lib/stores/chatUI';
import {useImageGen} from '@/lib/stores/imageGen';

const ACTION_CLASS = actionClass("secondary", "md");

/**
 * 资产详情页（/agent/assets/{kind}/{id}）：左栏保留，中央区整块换成这里。
 * 每种类型复用既有渲染件（笔记渲染器 / 复习闪卡 / 长文 / 沙箱 iframe），不做第二套预览。
 */
export default function AgentAssetDetail({ kind, id }: { kind: AssetKind; id: string }) {
  const owner = useFileLibrary(state => state.owner);
  const key = `${owner ?? 'signed-out'}:${kind}:${id}`;
  if (kind === 'file' && id.startsWith('cloud-')) return <CloudFileDetail key={key} fileId={id.slice(6)} />;
  return <LocalAssetDetail key={key} kind={kind} id={id} />;
}
function LocalAssetDetail({ kind, id }: { kind: AssetKind; id: string }) {
  const router = useRouter();
  const assets = useAgentAssets();
  const note = useUserNotes((s) => s.byId[id]);
  const card = useReviewCards((s) => s.byId[id]);
  const doc = useDocuments((s) => s.byId[id]);
  const [bodyError,setBodyError]=useState('');
  useEffect(() => {
    if (kind !== "document") return;
    const release = acquireDocumentBodyLease(id);
    void hydrateDocumentBody(id).then(ok=>{if(!ok)void loadDocumentFull(id).catch(e=>setBodyError(e.message));});
    return release;
  }, [kind, id,doc?.cloudRevision]);
  const artifact = useArtifacts((s) => s.byId[id]);
  useEffect(() => {
    if (kind !== "artifact") return;
    const release = acquireArtifactBodyLease(id);
    void hydrateArtifactBody(id).then(ok=>{if(!ok)void import('@/lib/stores/artifacts').then(mod=>mod.loadArtifactFull(id)).catch(e=>setBodyError(e.message));});
    return release;
  }, [kind, id,artifact?.cloudRevision]);
  const importRecord = useImports((s) => s.byId[id]);
  const [flipped, setFlipped] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const confirmationEpoch = useRef<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const item = useMemo(
    () => assets?.find((entry) => entry.kind === kind && entry.id === id) ?? null,
    [assets, id, kind],
  );
  useEffect(()=>{const kinds={artifact:'artifact',document:'document',note:'user-note',flashcard:'review-card',image:'image-gen'} as const;const cloudKind=kinds[kind as keyof typeof kinds];if(item?.origin==='cloud'&&cloudKind)void import('@/lib/sync/engine').then(mod=>mod.loadOneCloudAsset(cloudKind,id));},[item?.origin,kind,id]);
  /** 与资产页同一条口径：数据就绪后再压一小段（约 1 秒）骨架，换页不跳。 */
  const showSkeleton = useMinimumSkeleton({ ready: assets !== null });

  const back = (
    <Link href={ASSET_LIST_HREF} className={ACTION_CLASS}>
      <ArrowLeft size={14} /> 返回资产
    </Link>
  );

  if(kind==="classroom")return <section className="space-y-4 p-6">{back}<h1 className="text-xl font-semibold">{item?.title||"课堂记录"}</h1><Link href={`/class?session=${encodeURIComponent(id)}`} className={ACTION_CLASS}>打开课堂工作台</Link></section>;

  if (assets !== null && !item) {
    return (
      <section data-testid="agent-asset-detail" className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[13px] text-[var(--ink-soft)]">这件资产不在本机了（可能已在别处删除，或还没同步下来）。</p>
        {back}
      </section>
    );
  }

  const copy = async (label: string, text: string) => {
    const ok = await copyTextToClipboard(text);
    setCopied(ok ? label : null);
    if (ok) window.setTimeout(() => setCopied(null), 1600);
  };

  const removeAsset = () => {
    if (confirmationEpoch.current !== getOwnerEpoch()) { setConfirming(false); return; }
    if(kind==='image'){useImageGen.getState().removeSession(id);void import('@/lib/sync/schedule').then(mod=>mod.scheduleCloudTombstone('image-gen',id));router.push(ASSET_LIST_HREF);return;}
    if(importRecord?.localFileId){void removeLocalSource(importRecord.id).then(()=>router.push(ASSET_LIST_HREF));return;}
    if (kind === "note") useUserNotes.getState().removeNote(id);
    else if (kind === "flashcard") useReviewCards.getState().remove(id);
    else if (kind === "document") {
      const keep = Object.keys(useDocuments.getState().byId).filter((key) => key !== id);
      useDocuments.getState().prune(keep);
    } else if (kind === "artifact") {
      const keep = useArtifacts.getState().order.filter((key) => key !== id);
      useArtifacts.getState().prune(keep);
    } else {
      useImports.getState().remove(id);
    }
    setConfirming(false);
    router.push(ASSET_LIST_HREF);
  };

  const actions: React.ReactNode[] = [];
  if (kind === "note" && note) {
    actions.push(
      <button key="open" type="button" className={ACTION_CLASS} onClick={() => openNoteEditor(note.id)}>
        <PenLine size={14} /> 打开编辑器
      </button>,
      <button key="cite" type="button" className={ACTION_CLASS} onClick={() => { citeUserNoteToMainAgent(note.id); router.push("/agent"); }}>
        <Quote size={14} /> 引用到对话
      </button>,
    );
  }
  if (kind === "flashcard" && card) {
    actions.push(
      <button key="review" type="button" className={ACTION_CLASS} onClick={() => router.push(`/${card.subjectId}/review`)}>
        <FolderOpen size={14} /> 去复习板
      </button>,
    );
  }
  if (kind === "document" && doc) {
    actions.push(
      <button key="open" type="button" className={ACTION_CLASS} onClick={() => useDocuments.getState().openViewer(doc.id)}>
        <FolderOpen size={14} /> 打开长文窗
      </button>,
      <button key="copy" type="button" className={ACTION_CLASS} onClick={() => void loadDocumentFull(doc.id).then((full) => {
        if (full) void copy("markdown", assembleDocumentMarkdown(full));
      }).catch(() => {})}>
        <Copy size={14} /> {copied === "markdown" ? "已复制" : "复制 Markdown"}
      </button>,
    );
  }
  if (kind === "artifact" && artifact) {
    if (artifact.status === 'draft' || artifact.status === 'error') actions.push(
      <button key="save-draft" type="button" className={ACTION_CLASS} onClick={() => {
        const operation = captureStorageOperation(id);
        void loadArtifactFull(id).then(full => {
          if (!operation.isCurrent() || !full?.html) return;
          const copyId = crypto.randomUUID();
          useArtifacts.getState().saveDone(copyId, `${full.title}（保留稿）`, full.html);
          router.push(`/agent/assets/artifact/${copyId}`);
        }).catch(error => { if (operation.isCurrent()) setBodyError(error.message); });
      }}>将保留稿另存为独立文档</button>,
    );
    actions.push(
      <button key="open" type="button" className={ACTION_CLASS} onClick={() => useArtifacts.getState().openViewer(artifact.id)}>
        <FolderOpen size={14} /> 在右栏打开
      </button>,
      <button key="tab" type="button" className={ACTION_CLASS} onClick={() => openHtmlInNewTab(artifact.html)}>
        <ExternalLink size={14} /> 在新标签页打开
      </button>,
    );
  }
  if (kind === 'document' && doc?.status === 'error') actions.push(
    <button key="save-document-draft" className={ACTION_CLASS} onClick={() => {
      const operation = captureStorageOperation(id);
      void loadDocumentFull(id).then(full => {
        if (!operation.isCurrent() || !full) return;
        const copyId = crypto.randomUUID();
        useDocuments.getState().create(copyId, { ...full.spec, title: `${full.spec.title}（保留稿）` }, full.modelId);
        useDocuments.getState().setSections(copyId, full.sections);
        useDocuments.getState().setStatus(copyId, 'done');
        router.push(`/agent/assets/document/${copyId}`);
      }).catch(error => { if (operation.isCurrent()) setBodyError(error.message); });
    }}>将保留稿另存为独立文档</button>,
  );
  if (kind === "file" && importRecord) {
    if(importRecord.localFileId){
      actions.push(<button key="local-open" type="button" className={ACTION_CLASS} onClick={()=>openAttachmentPreview('local:'+importRecord.id,{localFileId:importRecord.id,name:importRecord.name,mimeType:importRecord.mimeType??'',kind:'text',content:''})}>打开本地文件</button>);
      actions.push(<button key="local-cite" type="button" className={ACTION_CLASS} onClick={()=>{const history=useChatHistory.getState(),session=history.activeSessionId??history.createSession();useImports.getState().record({...importRecord,id:importRecord.id,sessionId:session});useChatUI.getState().setQuotedText(`请读取本地文件「${importRecord.name}」，sourceId=${importRecord.id}。`);router.push('/agent');}}>引用到对话</button>);
      actions.push(<button key="local-project" type="button" className={ACTION_CLASS} onClick={() => {
        const projectId = useChatHistory.getState().activeProjectId;
        if (!projectId) { setBodyError('请先选择一个项目，再关联此本地文件。'); return; }
        useImports.getState().record({ ...importRecord, id: importRecord.id, projectId });
        setBodyError('已关联当前项目，原文件仍仅保存在本机。');
      }}>关联当前项目（仅本机）</button>);
    }
    if (importRecord.absPath) {
      actions.push(
        <button key="copy-path" type="button" className={ACTION_CLASS} onClick={() => void copy("path", importRecord.absPath as string)}>
          <Copy size={14} /> {copied === "path" ? "已复制路径" : "复制路径"}
        </button>,
      );
      if (isElectronDesktop()) {
        actions.push(
          <button key="system" type="button" className={ACTION_CLASS} onClick={() => window.open(`file://${importRecord.absPath}`, "_blank", "noopener")}>
            <ExternalLink size={14} /> 用系统打开
          </button>,
        );
      }
    }
  }
  if(kind==='image')actions.push(<button key="image-open" className={ACTION_CLASS} onClick={()=>useImageGen.getState().bringToFront(id)}>打开生成图片</button>);
  if (kind === "url" && importRecord?.url) {
    const href = importRecord.url;
    actions.push(
      <button key="open" type="button" className={ACTION_CLASS} onClick={() => openSourcePreview({ url: href, title: importRecord.title || importRecord.name })}>
        <ExternalLink size={14} /> 打开
      </button>,
      <button key="copy" type="button" className={ACTION_CLASS} onClick={() => void copy("url", href)}>
        <Copy size={14} /> {copied === "url" ? "已复制链接" : "复制链接"}
      </button>,
    );
  }

  return (
    <PageShell data-testid="agent-asset-detail" data-asset-kind={kind}>
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--line-soft)] px-5 py-3">
        {back}
        <span className="flex items-center gap-2 text-[11.5px] text-[var(--ink-faint)]">
          我的资产 / {ASSET_KIND_LABELS[kind]}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {bodyError?<p role="alert">{bodyError} <a className="underline" href={`/api/assets/body?${new URLSearchParams({kind:kind==='artifact'?'artifact':'document',clientId:id,download:'1'})}`} download>下载完整原稿</a></p>:null}
        {showSkeleton ? (
          <div className="mx-auto flex w-full max-w-[880px] flex-col gap-3" role="status" aria-label="资产加载中" data-testid="asset-detail-skeleton">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 ss-skel rounded-xl" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="h-4 w-[46%] ss-skel rounded" />
                <div className="h-3 w-[30%] ss-skel rounded" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="h-8 w-24 ss-skel rounded-lg" />
              <div className="h-8 w-24 ss-skel rounded-lg" />
              <div className="h-8 w-20 ss-skel rounded-lg" />
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-4">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <div key={index} className="h-3.5 ss-skel rounded" style={{ width: `${92 - index * 8}%` }} />
              ))}
            </div>
          </div>
        ) : item ? (
          <div className="mx-auto flex w-full max-w-[880px] flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-weak)] text-[var(--accent-ink)]">
                <AssetKindIcon item={item} size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-[16px] font-semibold text-[var(--ink)]">{item.title}</h1>
                <p className="mt-0.5 text-[12px] text-[var(--ink-faint)]">
                  {item.subtitle} · 更新于 {formatAssetTime(item.updatedAt)}
                  {formatAssetSize(item.sizeBytes) ? ` · ${formatAssetSize(item.sizeBytes)}` : ""}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {actions}
              {confirming ? (
                <span className="flex items-center gap-1.5" data-testid="asset-delete-confirm">
                  <span className="text-[12px] text-[var(--md-sys-color-error)]">
                    {kind === "file" || kind === "url" ? "只删这条记录？" : "删除后云端记录一并删除？"}
                  </span>
                  <button type="button" className="rounded-md bg-[var(--md-sys-color-error)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--md-sys-color-on-error)]" onClick={removeAsset}>
                    删除
                  </button>
                  <ActionButton size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                    取消
                  </ActionButton>
                </span>
              ) : (
                <ActionButton variant="danger" icon={<Trash2 size={14} />} onClick={() => { confirmationEpoch.current=getOwnerEpoch();setConfirming(true); }}>
                  {kind === "file" || kind === "url" ? "移除记录" : "删除"}
                </ActionButton>
              )}
            </div>

            <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-4">
              {kind === "note" && note ? (
                note.markdown.trim() ? (
                  <div className="prose-notes"><NoteRenderer content={note.markdown} /></div>
                ) : (
                  <p className="text-[12.5px] text-[var(--ink-faint)]">这篇笔记还是空的。</p>
                )
              ) : null}
              {kind === "flashcard" && card ? (
                <div className="relative mx-auto h-[360px] w-full max-w-[560px]">
                  <FlipCard
                    card={{ cardType: card.cardType, front: card.front || card.originalText, back: card.back, explanation: card.explanation }}
                    flipped={flipped}
                    onFlip={() => setFlipped((value) => !value)}
                  />
                </div>
              ) : null}
              {kind === "document" && doc ? (
                <div className="prose-notes"><NoteRenderer content={assembleDocumentMarkdown(doc)} /></div>
              ) : null}
              {kind === "artifact" && artifact ? (
                <iframe
                  title={artifact.title || "可交互演示"}
                  className="h-[560px] w-full rounded-lg border-0 bg-white"
                  srcDoc={injectOpaqueOriginStorageShim(artifact.html)}
                  sandbox={ARTIFACT_IFRAME_SANDBOX}
                />
              ) : null}
              {kind === "file" && importRecord ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
                  <dt className="text-[var(--ink-faint)]">文件名</dt><dd className="text-[var(--ink)]">{importRecord.name}</dd>
                  {importRecord.absPath ? (<><dt className="text-[var(--ink-faint)]">本机路径</dt><dd className="break-all text-[var(--ink)]">{importRecord.absPath}</dd></>) : null}
                  {importRecord.mimeType ? (<><dt className="text-[var(--ink-faint)]">类型</dt><dd className="text-[var(--ink)]">{importRecord.mimeType}</dd></>) : null}
                  <dt className="text-[var(--ink-faint)]">导入于</dt><dd className="text-[var(--ink)]">{formatAssetTime(importRecord.createdAt)}</dd>
                  <dt className="text-[var(--ink-faint)]">说明</dt>
                  <dd className="text-[var(--ink-soft)]">只记路径与元数据，文件本身不上云。</dd>
                </dl>
              ) : null}
              {kind === "url" && importRecord ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
                  <dt className="text-[var(--ink-faint)]">网址</dt><dd className="break-all text-[var(--ink)]">{importRecord.url}</dd>
                  <dt className="text-[var(--ink-faint)]">导入于</dt><dd className="text-[var(--ink)]">{formatAssetTime(importRecord.createdAt)}</dd>
                </dl>
              ) : null}
            </div>
          </div>
        ) : null}
        {/* 上面两个分支已经覆盖全部情形：
            数据没好 / 还没到最小骨架时长 → 骨架；找到了 → 正文。
            「数据好了但找不到这件资产」在更早的地方直接返回空态，不会走到这里。 */}
      </div>
    </PageShell>
  );
}

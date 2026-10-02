"use client";

import dynamic from "next/dynamic";
import { useWindowManager } from "@/lib/stores/windowManager";
import { useUserNotes } from "@/lib/stores/userNotes";
import {useFloatingChats} from '@/lib/stores/floatingChats'
import {useQuizExplain} from '@/lib/stores/quizExplain'
import {useRecordPreviews} from '@/lib/stores/recordPreviews'
import {useArtifacts} from '@/lib/stores/artifacts'
import {useImageGen} from '@/lib/stores/imageGen'
import {useDocuments} from '@/lib/stores/documents'
import {useNoteCitations} from '@/lib/stores/noteCitations'
import {useFlashcardCitations} from '@/lib/stores/flashcardCitations'
import {useAgentProductPicker} from '@/lib/stores/agentProductPicker'
import {useMemoryInbox} from '@/lib/stores/memoryInbox'
import {useContextMenu} from '@/lib/stores/contextMenu'
import UserNoteProposalRuntime from '@/components/notes/UserNoteProposalRuntime'
import MemoryInboxRuntime from '@/components/memory/MemoryInboxRuntime'

const FloatingChatLayer = dynamic(() => import("@/components/chat/FloatingChatLayer"), { ssr: false });
const QuizExplainLayer = dynamic(() => import("@/components/quiz/QuizExplainLayer"), { ssr: false });
const AgentQuizWindowLayer = dynamic(() => import("@/components/quiz/AgentQuizWindow"), { ssr: false });
const RecordPreviewLayer = dynamic(() => import("@/components/review/RecordPreviewLayer"), { ssr: false });
const ArtifactViewer = dynamic(() => import("@/components/chat/ArtifactViewer"), { ssr: false });
const ImageGenViewerLayer = dynamic(() => import("@/components/chat/ImageGenViewer"), { ssr: false });
const DocumentViewerLayer = dynamic(() => import("@/components/chat/DocumentViewer"), { ssr: false });
const NoteCitationViewer = dynamic(() => import("@/components/chat/NoteCitationViewer"), { ssr: false });
const UserNoteLayer = dynamic(() => import("@/components/notes/UserNoteLayer"), { ssr: false });
const FlashcardCiteWindow = dynamic(() => import("@/components/notes/FlashcardCiteWindow"), { ssr: false });
const AgentProductPickerWindow = dynamic(() => import("@/components/notes/AgentProductPickerWindow"), { ssr: false });
const MemoryInboxLayer = dynamic(() => import("@/components/memory/MemoryInboxLayer"), { ssr: false });
const SourceTraceViewer = dynamic(() => import("@/components/chat/SourceTraceViewer"), { ssr: false });
const SourcePreviewViewer = dynamic(() => import("@/components/chat/SourcePreviewViewer"), { ssr: false });
const AttachmentPreviewViewer = dynamic(() => import("@/components/chat/AttachmentPreviewViewer"), { ssr: false });
const MessageContextMenu = dynamic(() => import("@/components/shared/MessageContextMenu"), { ssr: false });
const BillingDashboardLayer = dynamic(() => import("@/components/chat/BillingDashboard"), { ssr: false });
const MembershipSponsorLayer = dynamic(() => import("@/components/chat/MembershipSponsorWindow"), { ssr: false });
const ProjectFilesLayer = dynamic(() => import("@/components/project/ProjectFilesLayer"), { ssr: false });

const WINDOW_BITS={quizDock:1,sourceTrace:2,sourcePreview:4,attachment:8,billing:16,membership:32,projectFiles:64} as const

/** Static dynamic-import boundaries load only the viewer whose actual owner has an open window. */
export default function DeferredWindowLayers() {
  const mask=useWindowManager(state=>state.windows.reduce((bits,window)=>bits|(
    window.type==='quiz-dock'?WINDOW_BITS.quizDock:window.type==='source-trace-viewer'?WINDOW_BITS.sourceTrace:window.type==='source-preview'?WINDOW_BITS.sourcePreview:window.type==='attachment-preview'?WINDOW_BITS.attachment:window.type==='billing-dashboard'?WINDOW_BITS.billing:window.type==='membership-sponsor'?WINDOW_BITS.membership:window.type==='project-files'?WINDOW_BITS.projectFiles:0
  ),0))
  const floating=useFloatingChats(state=>state.windows.length>0)
  const quizExplain=useQuizExplain(state=>state.windows.length>0)
  const recordPreview=useRecordPreviews(state=>state.previews.length>0)
  const artifact=useArtifacts(state=>!!state.viewerId)
  const imageGen=useImageGen(state=>state.openIds.length>0)
  const document=useDocuments(state=>!!state.viewerId)
  const noteCitation=useNoteCitations(state=>!!state.activePath&&state.hits.length>0)
  const userNote=useUserNotes(state=>state.openEditorIds.length>0||state.libraryOpen)
  const flashcardCite=useFlashcardCitations(state=>state.open)
  const productPicker=useAgentProductPicker(state=>state.open)
  const memoryInbox=useMemoryInbox(state=>state.order.some(id=>state.byId[id]?.status!=='dismissed'))
  const contextMenu=useContextMenu(state=>state.open)

  return (
    <>
      <UserNoteProposalRuntime/>
      <MemoryInboxRuntime/>
      {floating?<FloatingChatLayer/>:null}
      {quizExplain?<QuizExplainLayer/>:null}
      {mask&WINDOW_BITS.quizDock?<AgentQuizWindowLayer/>:null}
      {recordPreview?<RecordPreviewLayer/>:null}
      {artifact?<ArtifactViewer/>:null}
      {imageGen?<ImageGenViewerLayer/>:null}
      {document?<DocumentViewerLayer/>:null}
      {noteCitation?<NoteCitationViewer/>:null}
      {userNote?<UserNoteLayer/>:null}
      {flashcardCite?<FlashcardCiteWindow/>:null}
      {productPicker?<AgentProductPickerWindow/>:null}
      {memoryInbox?<MemoryInboxLayer/>:null}
      {mask&WINDOW_BITS.sourceTrace?<SourceTraceViewer/>:null}
      {mask&WINDOW_BITS.sourcePreview?<SourcePreviewViewer/>:null}
      {mask&WINDOW_BITS.attachment?<AttachmentPreviewViewer/>:null}
      {contextMenu?<MessageContextMenu/>:null}
      {mask&WINDOW_BITS.billing?<BillingDashboardLayer/>:null}
      {mask&WINDOW_BITS.membership?<MembershipSponsorLayer/>:null}
      {mask&WINDOW_BITS.projectFiles?<ProjectFilesLayer/>:null}
    </>
  );
}

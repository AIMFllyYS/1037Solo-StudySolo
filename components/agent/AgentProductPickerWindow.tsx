"use client";

import { useMemo } from "react";
import { FileDigit, MonitorPlay } from "lucide-react";
import ManagedWindow from "@/components/window/ManagedWindow";
import DocumentWorkspace from "@/components/window/DocumentWorkspace";
import { useAgentProductPicker } from "@/lib/stores/workspace/agentProductPicker";
import { useArtifacts } from "@/lib/stores/assets/artifacts";
import { useDocuments } from "@/lib/stores/assets/documents";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { AGENT_PRODUCT_PICKER_WINDOW_ID } from "@/lib/notes/userNote";
import { useT } from "@/lib/i18n";

function formatUpdatedAt(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Global Agent product selection; the chosen product opens in the existing window layer. */
export default function AgentProductPickerWindow() {
  const open = useAgentProductPicker((s) => s.open);
  if (!open) return null;
  return <AgentProductPicker />;
}

function AgentProductPicker() {
  const managed = useWindowManager((s) => s.windows.find((w) => w.id === AGENT_PRODUCT_PICKER_WINDOW_ID));
  const kind = useAgentProductPicker((s) => s.kind);
  const closePicker = useAgentProductPicker((s) => s.closePicker);
  const documents = useDocuments((s) => s.byId);
  const artifacts = useArtifacts((s) => s.byId);
  const artifactOrder = useArtifacts((s) => s.order);
  const openDocument = useDocuments((s) => s.openViewer);
  const openArtifact = useArtifacts((s) => s.openViewer);
  const t = useT();

  const documentItems = useMemo(
    () =>
      Object.values(documents)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((doc) => ({
          id: doc.id,
          title: doc.spec.title || t("window.note.picker.untitledDocument"),
          meta: `${formatUpdatedAt(doc.updatedAt)} · ${doc.status === "done" ? t("window.note.picker.statusDone") : t("window.note.picker.statusGenerating")}`,
        })),
    [documents, t],
  );

  const artifactItems = useMemo(
    () =>
      artifactOrder
        .map((id) => artifacts[id])
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .map((art) => ({
          id: art.id,
          title: art.title || t("window.note.picker.untitledArtifact"),
          meta: t("window.note.picker.interactiveHtml"),
        })),
    [artifactOrder, artifacts, t],
  );

  const items = kind === "document" ? documentItems : artifactItems;

  if (!managed) return null;

  return (
    <ManagedWindow
      windowId={AGENT_PRODUCT_PICKER_WINDOW_ID}
      title={managed.title}
      icon={kind === "document" ? <FileDigit size={15} /> : <MonitorPlay size={15} />}
      onClose={closePicker}
      fullscreenTarget="notes"
      minSize={{ minW: 480, minH: 340 }}
      overlayId="agent-product-picker"
      bodyClassName="flex min-h-0 min-w-0 flex-1 overflow-hidden"
      unmountWhenMinimized
    >
      {items.length === 0 ? (
        <div className="user-note-stage">
          <p className="user-note-empty">
            {kind === "document"
              ? t("window.note.picker.emptyDocument")
              : t("window.note.picker.emptyArtifact")}
          </p>
        </div>
      ) : (
        <DocumentWorkspace
          layoutKey="product-picker"
          outlineLabel={kind === "document" ? t("window.note.picker.outlineDocument") : t("window.note.picker.outlineArtifact")}
          outline={items.map((item) => ({
            id: item.id,
            title: item.title,
            meta: item.meta,
          }))}
          activeId=""
          onSelect={(id) => {
            if (kind === "document") openDocument(id);
            else openArtifact(id);
            closePicker();
          }}
          emptyLabel={kind === "document" ? t("window.note.picker.emptyOutlineDocument") : t("window.note.picker.emptyOutlineArtifact")}
        >
          <div className="user-note-stage">
            <p className="user-note-empty">{t("window.note.picker.hint")}</p>
          </div>
        </DocumentWorkspace>
      )}
    </ManagedWindow>
  );
}

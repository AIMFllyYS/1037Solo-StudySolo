"use client";

import { PanelSkeleton, type PanelSkeletonVariant } from "./LoadingStates";

/**
 * 拖拽 / 收展面板期间盖在内容上的覆盖层。
 *
 * 宽度一变，正文就会逐帧重排；盖一层与内容形态相符的骨架既避免文字异位，也省掉重排开销
 * （骨架只跑 transform / opacity，见 styles/loading.css）。骨架形态必须和被盖住的内容一致：
 * 对话列盖气泡，阅读区盖标题段落，管理页盖卡片 / 列表——不能在插件市场上方出现聊天气泡。
 */
export function ResizeSkeleton({ variant }: { variant: PanelSkeletonVariant }) {
  return (
    <div className="resize-loader" data-testid={`resize-skeleton-${variant}`}>
      <PanelSkeleton variant={variant} />
    </div>
  );
}

/** Agent 中央列按路由挑骨架形态：对话盖气泡，插件市场 / 资产盖卡片，其余管理页盖列表。 */
export function resizeVariantForAgentPath(pathname: string | null): PanelSkeletonVariant {
  if (!pathname || pathname === "/agent" || pathname.startsWith("/c/")) return "chat";
  if (pathname === "/agent/plugins" || pathname === "/agent/assets") return "cards";
  if (pathname === "/agent/scheduled") return "list";
  return "document";
}

/** 右栏（AI 对话）拖拽骨架。 */
export function ChatSkeleton() {
  return <ResizeSkeleton variant="chat" />;
}

/** 正文区拖拽骨架。 */
export function PageLoader() {
  return <ResizeSkeleton variant="document" />;
}

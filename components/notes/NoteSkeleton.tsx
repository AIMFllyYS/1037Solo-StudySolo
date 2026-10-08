/**
 * 文章形状骨架屏，用于笔记页导航加载期间。
 * 与 PanelSkeleton 共用 styles/loading.css 的 `ss-skel`（transform 高光，拖拽期也不触发重绘）。
 * 同时导出细粒度原语 SkeletonLine / SkeletonBlock 供其他组件复用。
 */

interface LineProps {
  width?: string | number;
  height?: number;
  className?: string;
}

interface BlockProps {
  height?: number;
  className?: string;
}

/** 单行闪烁条 */
export function SkeletonLine({ width = "100%", height = 14, className = "" }: LineProps) {
  return (
    <div
      className={`ss-skel rounded-[6px] ${className}`}
      style={{ width, height }}
    />
  );
}

/** 矩形闪烁块（适用于 callout、视频嵌块等） */
export function SkeletonBlock({ height = 80, className = "" }: BlockProps) {
  return (
    <div
      className={`ss-skel rounded-[10px] ${className}`}
      style={{ height }}
    />
  );
}

/** 完整文章形状骨架，模拟：面包屑 → 标题 → 摘要 → 两节正文 + callout + 公式块 */
/** @public 笔记页加载骨架，供路由 loading 与占位复用（PanelSkeleton 的 document 形态即它）。 */
export function NoteSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-10">
      {/* 面包屑 */}
      <SkeletonLine width={130} height={11} className="mb-6 opacity-60" />

      {/* 大标题 */}
      <SkeletonLine width="68%" height={30} className="mb-3" />

      {/* 摘要两行 */}
      <SkeletonLine width="90%" height={14} className="mb-2" />
      <SkeletonLine width="62%" height={14} className="mb-10" />

      {/* H2 节标题 */}
      <SkeletonLine width="42%" height={20} className="mb-4" />

      {/* 段落行组 1 */}
      <div className="flex flex-col gap-[10px] mb-2">
        <SkeletonLine height={14} />
        <SkeletonLine height={14} />
        <SkeletonLine height={14} />
        <SkeletonLine width="78%" height={14} />
      </div>

      {/* 段落行组 2 */}
      <div className="flex flex-col gap-[10px] mb-7">
        <SkeletonLine height={14} />
        <SkeletonLine height={14} />
        <SkeletonLine width="55%" height={14} />
      </div>

      {/* Callout / 定义块骨架 */}
      <SkeletonBlock height={76} className="mb-8" />

      {/* H3 子节标题 */}
      <SkeletonLine width="34%" height={16} className="mb-4" />

      {/* 段落行组 3 */}
      <div className="flex flex-col gap-[10px] mb-6">
        <SkeletonLine height={14} />
        <SkeletonLine height={14} />
        <SkeletonLine width="84%" height={14} />
      </div>

      {/* 公式块骨架 */}
      <SkeletonBlock height={52} className="mb-6" />

      {/* 尾段 */}
      <div className="flex flex-col gap-[10px]">
        <SkeletonLine height={14} />
        <SkeletonLine width="66%" height={14} />
      </div>
    </div>
  );
}

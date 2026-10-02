"use client";

import { useCallback, useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, Folder, FolderOpen, Home } from "lucide-react";
import FileTree from "./FileTree";
import AnimatedCollapse from "@/components/ui/AnimatedCollapse";
import { useStore } from "@/lib/store";
import { navTree } from "@/lib/content-data/nav";
import { filterSubjectsByYear } from "@/lib/constants/academic-year";
import { filterRuntimeSubjects } from "@/lib/content/offlineSubjects";
import { useAcademicYear } from "@/lib/hooks/useAcademicYear";
import SubjectIcon from "@/components/shared/SubjectIcon";
import type { ContentItem } from "@/lib/types/content";

/**
 * 桌面侧栏与手机抽屉共用的科目/分类/文件树。
 * 展开键、选中键、路由跳转与 SubjectSidebar 同一套逻辑。
 */
export default function SubjectFolderTree({
  onLeafSelect,
}: {
  onLeafSelect?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const expandedIds = useStore((s) => s.expandedIds);
  const toggleExpand = useStore((s) => s.toggleExpand);
  const academicYear = useAcademicYear((s) => s.year);
  const hydrateYear = useAcademicYear((s) => s.hydrate);
  const visibleSubjects = useMemo(
    () => filterSubjectsByYear(filterRuntimeSubjects(navTree.subjects), academicYear),
    [academicYear],
  );

  useEffect(() => {
    hydrateYear();
  }, [hydrateYear]);

  const selectedKey = useMemo(() => {
    const segs = pathname.split("/").filter(Boolean);
    return segs.length >= 3 ? `${segs[0]}/${segs[1]}/${segs[2]}` : null;
  }, [pathname]);

  const handleItemSelect = useCallback(
    (subjectId: string, categoryId: string, item: ContentItem) => {
      router.push(`/${subjectId}/${categoryId}/${item.id}`);
      onLeafSelect?.();
    },
    [router, onLeafSelect],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="subject-folder-tree">
      <button
        type="button"
        onClick={() => {
          router.push("/");
          onLeafSelect?.();
        }}
        className="press"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          margin: "6px 8px 2px",
          padding: "8px 10px",
          width: "calc(100% - 16px)",
          borderRadius: 9,
          border: "none",
          background: pathname === "/" ? "var(--md-sys-color-secondary-container)" : "transparent",
          color: pathname === "/" ? "var(--md-sys-color-on-secondary-container)" : "var(--md-sys-color-on-surface-variant)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
        title="首页 · 书架"
      >
        <Home size={15} /> 首页
      </button>

      <div className="scroll-y flex-1" style={{ padding: "4px 0" }}>
        {visibleSubjects.map((subject) => {
          const isSubjectExpanded = expandedIds.has(subject.id);

          return (
            <div key={subject.id}>
              <button
                type="button"
                onClick={() => toggleExpand(subject.id)}
                className="flex w-full items-center gap-1 border-0 bg-transparent text-left outline-none"
                style={{
                  height: 28,
                  paddingLeft: 8,
                  paddingRight: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--md-sys-color-on-surface)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "var(--md-sys-color-surface-container-high)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "";
                }}
              >
                <span
                  className="inline-flex shrink-0 items-center justify-center"
                  style={{
                    width: 16,
                    height: 16,
                    transition: "transform 0.35s cubic-bezier(0.05,0.7,0.1,1.0)",
                    transform: isSubjectExpanded ? "rotate(90deg)" : "rotate(0deg)",
                  }}
                >
                  <ChevronRight size={14} />
                </span>
                <span className="inline-flex shrink-0 items-center justify-center" style={{ width: 18, height: 18 }}>
                  <SubjectIcon subjectId={subject.id} size={15} />
                </span>
                <span className="truncate">{subject.name}</span>
              </button>

              <AnimatedCollapse isOpen={isSubjectExpanded}>
                {subject.categories.map((category) => {
                  const catId = `${subject.id}-${category.id}`;
                  const isCatExpanded = expandedIds.has(catId);

                  return (
                    <div key={category.id}>
                      <button
                        type="button"
                        onClick={() => toggleExpand(catId)}
                        className="flex w-full items-center gap-1 border-0 bg-transparent text-left outline-none"
                        style={{
                          height: 28,
                          paddingLeft: 24,
                          paddingRight: 8,
                          fontSize: 13,
                          color: "var(--md-sys-color-on-surface-variant)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            "var(--md-sys-color-surface-container-high)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "";
                        }}
                      >
                        <span
                          className="inline-flex shrink-0 items-center justify-center"
                          style={{
                            width: 16,
                            height: 16,
                            transition: "transform 0.35s cubic-bezier(0.05,0.7,0.1,1.0)",
                            transform: isCatExpanded ? "rotate(90deg)" : "rotate(0deg)",
                          }}
                        >
                          <ChevronRight size={14} />
                        </span>
                        <span className="inline-flex shrink-0 items-center justify-center" style={{ width: 18, height: 18 }}>
                          {isCatExpanded ? (
                            <FolderOpen size={15} style={{ color: "var(--md-sys-color-primary)" }} />
                          ) : (
                            <Folder size={15} style={{ color: "var(--md-sys-color-outline)" }} />
                          )}
                        </span>
                        <span className="truncate">{category.name}</span>
                      </button>

                      <AnimatedCollapse isOpen={isCatExpanded}>
                        <FileTree
                          items={category.items}
                          depth={3}
                          subjectId={subject.id}
                          categoryId={category.id}
                          selectedId={selectedKey}
                          onItemSelect={handleItemSelect}
                        />
                      </AnimatedCollapse>
                    </div>
                  );
                })}
              </AnimatedCollapse>
            </div>
          );
        })}
      </div>
    </div>
  );
}

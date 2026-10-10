"use client";

import { useEffect, useId } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ACADEMIC_YEAR_GRADES,
  ACADEMIC_YEAR_LABELS,
  academicYearOfSubject,
  gradeOfAcademicYear,
  termOfAcademicYear,
  type AcademicTerm,
  type AcademicYearGrade,
  type AcademicYearId,
} from "@/lib/constants/academic-year";
import { useAcademicYear } from "@/lib/hooks/useAcademicYear";
import { DURATION, EASE } from "@/lib/motion";

/**
 * 两级学年选择：先年级（大一～大五），再学期（上 / 下）。
 * 书架用与学科卡相同的列宽横滑对齐；设置面板用紧凑五列。
 */
export default function AcademicYearSwitcher({
  variant = "compact",
}: {
  variant?: "shelf" | "compact";
}) {
  const year = useAcademicYear((s) => s.year);
  const setYear = useAcademicYear((s) => s.setYear);
  const hydrate = useAcademicYear((s) => s.hydrate);
  const router = useRouter();
  const pathname = usePathname();
  const motionId = useId();
  const currentGrade = gradeOfAcademicYear(year);
  const currentTerm = termOfAcademicYear(year);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const applyYear = (next: AcademicYearId) => {
    if (next === year) return;
    setYear(next);
    const firstSeg = pathname.split("/").filter(Boolean)[0];
    if (firstSeg && academicYearOfSubject(firstSeg) !== next) {
      router.push("/");
    }
  };

  const applyGrade = (group: AcademicYearGrade) => {
    applyYear(currentTerm === "fall" ? group.fall : group.spring);
  };

  const applyTerm = (term: AcademicTerm) => {
    applyYear(term === "fall" ? currentGrade.fall : currentGrade.spring);
  };

  const thumbTransition = {
    duration: DURATION.normal,
    ease: EASE.decelerate,
  };

  const shelf = variant === "shelf";

  return (
    <div
      role="group"
      aria-label="切换学年"
      className={shelf ? "year-switcher-shelf" : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        role="radiogroup"
        aria-label="年级"
        className={shelf ? "hide-scrollbar year-switcher-shelf-grades" : "hide-scrollbar"}
        style={
          shelf
            ? undefined
            : {
                display: "grid",
                gridTemplateColumns: "repeat(5, minmax(56px, 1fr))",
                gap: 8,
                overflowX: "auto",
              }
        }
      >
        {ACADEMIC_YEAR_GRADES.map((group) => {
          const selected = group.grade === currentGrade.grade;
          return (
            <button
              key={group.grade}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={group.shortLabel}
              onClick={() => applyGrade(group)}
              className="press year-switcher-term"
              style={{
                position: "relative",
                isolation: "isolate",
                display: "flex",
                alignItems: "center",
                justifyContent: shelf ? "flex-start" : "center",
                height: shelf ? 48 : 40,
                border: "none",
                cursor: "pointer",
                borderRadius: 12,
                padding: shelf ? "0 16px" : 0,
                fontSize: shelf ? 20 : 14,
                fontWeight: selected ? 800 : 650,
                letterSpacing: 0,
                color: "var(--ink)",
                background: "var(--md-sys-color-surface-container-high)",
                boxShadow: "inset 0 0 0 1px var(--line)",
              }}
            >
              {selected && (
                <motion.span
                  layoutId={`${motionId}-grade`}
                  transition={thumbTransition}
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 12,
                    background: "var(--md-sys-color-primary-container)",
                    boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--md-sys-color-primary) 28%, var(--line))",
                    zIndex: 0,
                    pointerEvents: "none",
                  }}
                />
              )}
              <span style={{ position: "relative", zIndex: 1 }}>{group.shortLabel}</span>
            </button>
          );
        })}
      </div>

      <div
        role="radiogroup"
        aria-label="学期"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          padding: 4,
          borderRadius: 14,
          background: "var(--md-sys-color-surface-container)",
          border: "1px solid var(--line)",
        }}
      >
        {(
          [
            { term: "fall" as const, short: "上学期", id: currentGrade.fall },
            { term: "spring" as const, short: "下学期", id: currentGrade.spring },
          ] as const
        ).map((item) => {
          const selected = currentTerm === item.term;
          return (
            <button
              key={item.term}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={ACADEMIC_YEAR_LABELS[item.id]}
              onClick={() => applyTerm(item.term)}
              className="press year-switcher-term"
              style={{
                position: "relative",
                isolation: "isolate",
                height: 42,
                border: "none",
                cursor: "pointer",
                borderRadius: 10,
                padding: 0,
                fontSize: 14,
                fontWeight: selected ? 750 : 600,
                letterSpacing: 0,
                color: "var(--ink)",
                background: "transparent",
              }}
            >
              {selected && (
                <motion.span
                  layoutId={`${motionId}-term`}
                  transition={thumbTransition}
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 10,
                    background: "var(--md-sys-color-surface-container-lowest)",
                    boxShadow: "0 1px 3px color-mix(in srgb, var(--ink) 14%, transparent)",
                    zIndex: 0,
                    pointerEvents: "none",
                  }}
                />
              )}
              <span style={{ position: "relative", zIndex: 1 }}>{item.short}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

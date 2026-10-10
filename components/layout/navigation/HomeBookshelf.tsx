"use client";

import { useEffect } from "react";
import Link from "next/link";
import { GraduationCap, BookOpenCheck } from "lucide-react";
import NotebookFormulaIcon from "@/components/icons/NotebookFormulaIcon";
import { openNoteLibrary } from "@/lib/notes/openUserNote";
import homeSubjects from "@/lib/content-data/home.generated.json";
import { filterRuntimeSubjects } from "@/lib/content/offlineSubjects";
import { subjectColor } from "@/lib/content-data/subjects.registry";
import SubjectIcon from "@/components/shared/SubjectIcon";
import { BOOKSHELF_GRID_COLUMNS, BOOKSHELF_GRID_GAP, filterSubjectsByYear } from "@/lib/constants/academic-year";
import { useAcademicYear } from "@/lib/stores/academicYear";
import AcademicYearSwitcher from "./AcademicYearSwitcher";

type HomeSubject = (typeof homeSubjects)[number];

function overlayBtn(primary: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 16px",
    borderRadius: 9,
    fontSize: 13,
    fontWeight: 600,
    textDecoration: "none",
    minWidth: 118,
    justifyContent: "center",
    background: primary ? "#fff" : "transparent",
    color: primary ? "#141414" : "#fff",
    border: primary ? "none" : "1.5px solid rgba(255,255,255,0.85)",
  };
}

function BookCard({ subject }: { subject: HomeSubject }) {
  const learnHref = subject.learnHref;
  const chapterCount = subject.chapterCount;
  const color = subjectColor(subject.id);

  return (
    <div className="group" data-subject-id={subject.id} style={{ position: "relative", aspectRatio: "3 / 4" }}>
      <div
        style={{
          height: "100%",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          padding: 16,
          borderRadius: "4px 12px 12px 4px",
          overflow: "hidden",
          border: "1px solid var(--line)",
          borderLeft: `6px solid ${color}`,
          background: `linear-gradient(150deg, color-mix(in oklab, ${color} 22%, var(--md-sys-color-surface-container-high)) 0%, var(--md-sys-color-surface-container-high) 72%)`,
          boxShadow: "0 8px 22px -10px rgba(0,0,0,0.35)",
          transition: "transform 0.18s ease, box-shadow 0.18s ease",
        }}
        className="group-hover:-translate-y-1 group-hover:shadow-lg"
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: `linear-gradient(90deg, transparent, color-mix(in oklab, ${color} 60%, transparent), transparent)`,
            pointerEvents: "none",
          }}
        />
        <SubjectIcon
          iconName={subject.icon}
          size={150}
          style={{
            position: "absolute",
            right: -22,
            bottom: -16,
            color,
            opacity: 0.08,
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative", zIndex: 1 }}>
          <SubjectIcon iconName={subject.icon} size={30} style={{ color }} />
        </div>
        <div style={{ marginTop: "auto", position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 16.5, fontWeight: 700, color: "var(--ink)", lineHeight: 1.25 }}>
            {subject.name}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 3 }}>
            {subject.categoryCount} 个板块 · {chapterCount} 项
          </div>
        </div>
        <div
          className="opacity-0 group-hover:opacity-100"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(10,12,20,0.56)",
            backdropFilter: "blur(1px)",
            transition: "opacity 0.18s ease",
            padding: 16,
          }}
        >
          {learnHref ? (
            <Link href={learnHref} style={overlayBtn(true)}>
              <GraduationCap size={15} /> 开始学习
            </Link>
          ) : (
            <span style={{ ...overlayBtn(true), opacity: 0.5, cursor: "default" }}>
              <GraduationCap size={15} /> 暂无内容
            </span>
          )}
          <Link href={`/${subject.id}/review`} style={overlayBtn(false)}>
            <BookOpenCheck size={15} /> 开始复习
          </Link>
          <button
            type="button"
            onClick={() => openNoteLibrary({ subjectId: subject.id, intent: "browse" })}
            style={{ ...overlayBtn(false), cursor: "pointer" }}
          >
            <NotebookFormulaIcon size={15} /> 笔记
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HomeBookshelf() {
  const year = useAcademicYear((s) => s.year);
  const hydrate = useAcademicYear((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const subjects = filterSubjectsByYear(filterRuntimeSubjects(homeSubjects), year);

  return (
    <div className="scroll-y" style={{ height: "100%", background: "var(--bg-app)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 28px 56px" }}>
        <header style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.01em" }}>
            StudySolo
          </h1>
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 8, lineHeight: 1.7 }}>
            选一本书：<b>开始学习</b> 进入正文，<b>开始复习</b> 翻看记忆卡，<b>笔记</b> 写下这一科的个人笔记。
          </p>
        </header>

        <div style={{ marginBottom: BOOKSHELF_GRID_GAP }}>
          <AcademicYearSwitcher variant="shelf" />
        </div>

        {subjects.length === 0 ? (
          <div
            style={{
              padding: "28px 22px",
              borderRadius: 16,
              border: "1px dashed var(--line)",
              background: "var(--md-sys-color-surface-container-low)",
              color: "var(--ink)",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 750 }}>这一学期还没有课程</div>
            <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 8, lineHeight: 1.7 }}>
              点选上方年级和学期。大一、大二的课仍在磁盘上，不会被删掉。
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: BOOKSHELF_GRID_COLUMNS,
              gap: BOOKSHELF_GRID_GAP,
            }}
          >
            {subjects.map((subject) => (
              <BookCard key={subject.id} subject={subject} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

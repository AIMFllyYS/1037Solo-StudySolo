"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Film } from "lucide-react";

import { getVideo } from "@/lib/content-data/media";

import { useT } from "@/lib/i18n";
const InlinePlayer = dynamic(() => import("@/components/video/InlinePlayer"), {
  ssr: false,
  loading: () => <div className="aspect-video w-full animate-shimmer rounded-lg" />,
});

/** Manim 视频讲解卡片（复杂题，点击播放）。 */
export function ManimVideo({ id }: { id: string }) {
  const t = useT();
  const [playing, setPlaying] = useState(false);
  const video = getVideo(id);
  return (
    <div style={{ marginTop: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 700, color: "var(--md-sys-color-on-surface-variant)", marginBottom: "6px" }}>
        <Film size={14} style={{ color: "var(--md-sys-color-primary)" }} />
        {t("window.quiz.question.manimTitle")}
      </div>
      {!video ? (
        <div style={{ fontSize: "12.5px", color: "var(--md-sys-color-on-surface-variant)", padding: "10px 12px", borderRadius: "var(--md-sys-shape-corner-medium)", border: "1px dashed var(--md-sys-color-outline-variant)" }}>
          {t("window.quiz.question.manimPending", { id })}
        </div>
      ) : playing ? (
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
          <InlinePlayer video={video} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="hover-lift"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            width: "100%",
            textAlign: "left",
            padding: "12px 14px",
            borderRadius: "var(--md-sys-shape-corner-medium)",
            border: "1px solid var(--md-sys-color-outline-variant)",
            background: "var(--md-sys-color-surface-container-lowest)",
            cursor: "pointer",
          }}
        >
          <span style={{ display: "grid", placeItems: "center", width: "36px", height: "36px", borderRadius: "var(--md-sys-shape-corner-full)", background: "var(--md-sys-color-primary-container)", color: "var(--md-sys-color-on-primary-container)", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </span>
          <span style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--md-sys-color-on-surface)" }}>
            {video.title || t("window.quiz.question.playVideo")}
          </span>
        </button>
      )}
    </div>
  );
}
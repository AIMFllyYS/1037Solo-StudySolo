"use client";

import { Loader } from "lucide-react";

import { useT } from "@/lib/i18n/index";

export function WatercolorLoading({ count }: { count: number }) {
  const t = useT();
  const cells = Array.from({ length: count });
  const cols = count === 1 ? 1 : 2;
  return (
    <div
      className="grid gap-3 p-4"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      <style>{`
        @keyframes hf-watercolor-1 {
          0% { transform: translate(0%, 0%) scale(1); opacity: 0.55; }
          50% { transform: translate(15%, -10%) scale(1.15); opacity: 0.78; }
          100% { transform: translate(0%, 0%) scale(1); opacity: 0.55; }
        }
        @keyframes hf-watercolor-2 {
          0% { transform: translate(0%, 0%) scale(1); opacity: 0.5; }
          50% { transform: translate(-12%, 10%) scale(1.2); opacity: 0.75; }
          100% { transform: translate(0%, 0%) scale(1); opacity: 0.5; }
        }
        @keyframes hf-watercolor-3 {
          0% { transform: translate(0%, 0%) scale(1); opacity: 0.45; }
          50% { transform: translate(8%, 14%) scale(1.18); opacity: 0.7; }
          100% { transform: translate(0%, 0%) scale(1); opacity: 0.45; }
        }
        @keyframes hf-watercolor-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes hf-watercolor-pulse {
          0%, 100% { opacity: 0.85; }
          50% { opacity: 1; }
        }
      `}</style>
      {cells.map((_, idx) => (
        <div
          key={idx}
          className="relative overflow-hidden rounded-xl"
          style={{
            aspectRatio: "1 / 1",
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--md-sys-color-tertiary) 8%, var(--md-sys-color-surface-container-low)), var(--md-sys-color-surface-container-low))",
            border: "1px solid var(--md-sys-color-outline-variant)",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "-15%",
              top: "-15%",
              width: "70%",
              height: "70%",
              borderRadius: "50%",
              background:
                "radial-gradient(circle, color-mix(in srgb, var(--md-sys-color-primary) 80%, transparent) 0%, transparent 70%)",
              filter: "blur(28px)",
              animation: `hf-watercolor-1 5.2s ease-in-out infinite`,
              animationDelay: `${idx * 0.3}s`,
            }}
          />
          <div
            style={{
              position: "absolute",
              right: "-15%",
              bottom: "-12%",
              width: "75%",
              height: "75%",
              borderRadius: "50%",
              background:
                "radial-gradient(circle, color-mix(in srgb, var(--md-sys-color-tertiary) 75%, transparent) 0%, transparent 72%)",
              filter: "blur(32px)",
              animation: `hf-watercolor-2 6.4s ease-in-out infinite`,
              animationDelay: `${idx * 0.4}s`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "20%",
              top: "30%",
              width: "60%",
              height: "60%",
              borderRadius: "50%",
              background:
                "radial-gradient(circle, color-mix(in srgb, var(--md-sys-color-secondary) 65%, transparent) 0%, transparent 70%)",
              filter: "blur(24px)",
              animation: `hf-watercolor-3 7.0s ease-in-out infinite`,
              animationDelay: `${idx * 0.55}s`,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              zIndex: 2,
              animation: "hf-watercolor-pulse 2.4s ease-in-out infinite",
            }}
          >
            <Loader
              size={28}
              style={{
                color: "var(--md-sys-color-primary)",
                animation: "hf-watercolor-spin 1.4s linear infinite",
              }}
            />
            <div
              className="text-[11.5px] font-medium"
              style={{
                color: "var(--md-sys-color-on-surface)",
                textShadow:
                  "0 1px 2px color-mix(in srgb, var(--md-sys-color-surface) 60%, transparent)",
              }}
            >
              {t("window.imageGen.generating")}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
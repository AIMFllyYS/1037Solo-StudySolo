"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, type Transition, type TargetAndTransition } from "framer-motion";
import { useUiReducedMotion } from "@/lib/hooks/runtime/useUiReducedMotion";
import { useIsClient } from "@/lib/hooks/runtime/useIsClient";

/**
 * 左上角品牌徽标：在一组「透明底 · 多彩」图形之间，每隔 intervalMs 渐变切换；
 * 每个图形显示期间各自循环播放微动效（浮动/脉动/旋转）。尊重 prefers-reduced-motion。
 */

type AnimKind = "float" | "pulse" | "spin";
type Mark = { key: string; anim: AnimKind; node: React.ReactNode };

const LOOP: Record<AnimKind, { animate: TargetAndTransition; transition: Transition }> = {
  float: { animate: { y: [0, -2, 0] }, transition: { duration: 3.4, repeat: Infinity, ease: "easeInOut" } },
  pulse: { animate: { scale: [1, 1.09, 1] }, transition: { duration: 2.6, repeat: Infinity, ease: "easeInOut" } },
  spin: { animate: { rotate: [0, 360] }, transition: { duration: 10, repeat: Infinity, ease: "linear" } },
};

const MARKS: Mark[] = [
  { key: "doc", anim: "float", node: (
    <g fill="none" stroke="#ff8a6b" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 4.5 H13 L17.5 9 V19.5 H6.5 Z" />
      <path d="M13 4.5 V9 H17.5" />
      <line x1="9" y1="12.5" x2="15" y2="12.5" />
      <line x1="9" y1="15.5" x2="13.5" y2="15.5" />
    </g>
  ) },
  { key: "layers", anim: "float", node: (
    <g fill="none" stroke="#6ee7b7" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 9 L12 5.6 L19 9 L12 12.4 Z" />
      <path d="M5 12.4 L12 15.8 L19 12.4" />
      <path d="M5 15.6 L12 19 L19 15.6" />
    </g>
  ) },
  { key: "cap", anim: "float", node: (
    <>
      <defs>
        <linearGradient id="blCapGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b7bff" />
          <stop offset="1" stopColor="#5a3ff0" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#blCapGrad)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9.3 L12 5.4 L20 9.3 L12 13.2 Z" />
        <path d="M7 11 V15.2 C7 15.2 9 17 12 17 C15 17 17 15.2 17 15.2 V11" />
        <path d="M20 9.3 V14" />
      </g>
      <circle cx="20" cy="14.9" r="0.95" fill="#6a52f5" />
    </>
  ) },
  { key: "book", anim: "float", node: (
    <g stroke="#cdddff" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round">
      <path d="M12 7.2 C10 5.8 6.8 5.6 4.5 6.3 V17 C6.8 16.3 10 16.5 12 17.9" fill="#3f5da3" />
      <path d="M12 7.2 C14 5.8 17.2 5.6 19.5 6.3 V17 C17.2 16.3 14 16.5 12 17.9" fill="#5d7fcf" />
      <path d="M12 7.2 V17.9" fill="none" />
    </g>
  ) },
  { key: "check", anim: "pulse", node: (
    <path d="M5.5 12.6 L10 17 L18.5 7" fill="none" stroke="#f4c45a" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  ) },
  { key: "network", anim: "spin", node: (
    <>
      <g stroke="#f0a6d0" strokeWidth={1.3}>
        <line x1="7.3" y1="8.2" x2="11" y2="11" />
        <line x1="16.7" y1="7.8" x2="13" y2="11" />
        <line x1="11" y1="13" x2="8.3" y2="16.7" />
        <line x1="13" y1="13" x2="15.9" y2="16.4" />
      </g>
      <g fill="#f0a6d0">
        <circle cx="12" cy="12" r="2.1" />
        <circle cx="7" cy="8" r="1.4" />
        <circle cx="17" cy="7.6" r="1.4" />
        <circle cx="8" cy="17" r="1.4" />
        <circle cx="16.3" cy="16.6" r="1.4" />
      </g>
    </>
  ) },
  { key: "spark", anim: "pulse", node: (
    <g fill="#8ab4ff">
      <path d="M12 4.5 C12.5 8.2 13.4 9.1 17 9.6 C13.4 10.1 12.5 11 12 14.7 C11.5 11 10.6 10.1 7 9.6 C10.6 9.1 11.5 8.2 12 4.5 Z" />
      <circle cx="17.4" cy="15.2" r="1.3" />
    </g>
  ) },
];

export default function BrandLogo({
  size = 24,
  intervalMs = 5000,
}: {
  size?: number;
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);
  const mounted = useIsClient();
  const reduceMotion = useUiReducedMotion();

  useEffect(() => {
    const id = setInterval(
      () => setIndex((prev) => (prev + 1) % MARKS.length),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [intervalMs]);

  const current = MARKS[index];
  const loop = LOOP[current.anim];

  const shell = (
    <span
      className="relative inline-flex shrink-0"
      style={{ width: size, height: size }}
      aria-label="StudySolo"
      role="img"
    >
      {mounted ? (
        <AnimatePresence initial={false}>
          <motion.span
            key={current.key}
            className="inline-flex"
            style={{ position: "absolute", inset: 0 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeInOut" }}
          >
            <motion.svg
              width={size}
              height={size}
              viewBox="0 0 24 24"
              style={{ transformOrigin: "center" }}
              animate={reduceMotion ? undefined : loop.animate}
              transition={reduceMotion ? undefined : loop.transition}
            >
              {current.node}
            </motion.svg>
          </motion.span>
        </AnimatePresence>
      ) : (
        <span className="inline-flex" style={{ position: "absolute", inset: 0 }}>
          <svg width={size} height={size} viewBox="0 0 24 24" style={{ transformOrigin: "center" }}>
            {MARKS[0].node}
          </svg>
        </span>
      )}
    </span>
  );

  return shell;
}

"use client";

import { motion, useDragControls, type PanInfo } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { MediaPlayer, MediaProvider, type MediaPlayerInstance } from "@vidstack/react";
import { DefaultVideoLayout, defaultLayoutIcons } from "@vidstack/react/player/layouts/default";
import { useStore } from "@/lib/store";
import { videoPoster, resolveVideoSrc } from "@/lib/content/poster";

const zhTranslations = {
  Settings: "设置",
  Speed: "倍速",
  Normal: "正常",
  PIP: "画中画",
  Enter: "进入画中画",
  Exit: "退出画中画",
  Fullscreen: "全屏",
  EnterFullscreen: "进入全屏",
  ExitFullscreen: "退出全屏",
  Mute: "静音",
  Unmute: "取消静音",
  Captions: "字幕",
  "Captions off": "关闭字幕",
  Loop: "循环",
  Seek: "跳转",
  Play: "播放",
  Pause: "暂停",
  "Keyboard Shortcuts": "快捷键",
  Restart: "重新播放",
  Quality: "画质",
  Audio: "音量",
  Volume: "音量",
  Live: "直播",
  SeekBackward: "后退",
  SeekForward: "前进",
};

const DEFAULT_WIDTH = 440;
const DEFAULT_HEIGHT = 248;
const MIN_WIDTH = 300;
const MAX_WIDTH = 760;
const MIN_HEIGHT = 169;
const MAX_HEIGHT = 423;
const MARGIN = 24;

function clampGeometry(x: number, y: number, w: number, h: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.max(0, Math.min(x, vw - w - MARGIN)),
    y: Math.max(0, Math.min(y, vh - h - MARGIN)),
    width: w,
    height: h,
  };
}

export default function PipPlayerInner() {
  const video = useStore((s) => s.pipVideo);
  const startTime = useStore((s) => s.pipStartTime);
  const close = useStore((s) => s.closePip);
  const pipGeometry = useStore((s) => s.pipGeometry);
  const setPipGeometry = useStore((s) => s.setPipGeometry);

  const controls = useDragControls();
  const playerRef = useRef<MediaPlayerInstance>(null);
  const posRef = useRef({ x: 0, y: 0, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });

  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [initialized, setInitialized] = useState(false);

  if (typeof window !== "undefined" && video && !initialized) {
    const g = pipGeometry
      ? clampGeometry(pipGeometry.x, pipGeometry.y, pipGeometry.width, pipGeometry.height)
      : clampGeometry(
          window.innerWidth - DEFAULT_WIDTH - MARGIN,
          window.innerHeight - DEFAULT_HEIGHT - MARGIN,
          DEFAULT_WIDTH,
          DEFAULT_HEIGHT,
        );
    setWidth(g.width);
    setHeight(g.height);
    setPos({ x: g.x, y: g.y });
    setInitialized(true);
  }

  useEffect(() => {
    if (!initialized) return;
    posRef.current = { ...posRef.current, x: pos.x, y: pos.y, width, height };
  }, [pos, width, height, initialized]);

  useEffect(() => {
    if (!video || !initialized) return;
    const player = playerRef.current;
    if (!player) return;
    const onLoaded = () => {
      if (startTime) player.currentTime = startTime;
      player.play().catch(() => {});
      try { player.muted = false; } catch {}
    };
    player.addEventListener("can-play", onLoaded);
    return () => player.removeEventListener("can-play", onLoaded);
  }, [video, startTime, initialized]);

  if (!video) return null;

  const saveGeometry = () => {
    const g = clampGeometry(posRef.current.x, posRef.current.y, posRef.current.width, posRef.current.height);
    setPipGeometry(g);
  };

  const handleClose = () => {
    const player = playerRef.current;
    const returnTime = player?.state.currentTime ?? 0;
    saveGeometry();
    close(returnTime);
  };

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    const newX = pos.x + info.offset.x;
    const newY = pos.y + info.offset.y;
    const clamped = clampGeometry(newX, newY, width, height);
    setPos({ x: clamped.x, y: clamped.y });
    posRef.current = { ...posRef.current, x: clamped.x, y: clamped.y };
    saveGeometry();
  };

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = width;
    const startH = height;
    const move = (ev: PointerEvent) => {
      const newW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW + (ev.clientX - startX)));
      const newH = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startH + (ev.clientY - startY)));
      setWidth(newW);
      setHeight(newH);
      posRef.current = { ...posRef.current, width: newW, height: newH };
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      saveGeometry();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const poster = videoPoster(video);

  return (
    <motion.div
      drag
      dragControls={controls}
      dragListener={false}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1, transition: { type: "spring", stiffness: 350, damping: 25 } }}
      exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
      whileDrag={{ scale: 1.02, boxShadow: "0 24px 60px rgba(20,24,40,0.25)" }}
      className="fixed z-[100] overflow-hidden rounded-xl border border-black/20 bg-black shadow-[var(--shadow-lg)]"
      style={{ width, height, left: pos.x, top: pos.y }}
    >
      <div
        onPointerDown={(e) => controls.start(e)}
        className="flex cursor-move items-center justify-between gap-2 bg-[#23232b] px-2.5 py-1.5 text-white"
      >
        <span className="truncate text-[12.5px] font-medium">{video.title}</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleClose}
            title="关闭"
            className="grid h-6 w-6 place-items-center rounded hover:bg-white/15"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div style={{ height: height - 32 }}>
        <MediaPlayer
          ref={playerRef}
          load="eager"
          preload="metadata"
          src={resolveVideoSrc(video.src)}
          poster={poster || undefined}
          title={video.title}
          playsInline
          keyTarget="player"
          className="vs-player h-full"
        >
          <MediaProvider />
          <DefaultVideoLayout
            icons={defaultLayoutIcons}
            colorScheme="dark"
            translations={zhTranslations}
          />
        </MediaPlayer>
      </div>

      <div
        onPointerDown={startResize}
        className="absolute bottom-0 right-0 z-10 h-4 w-4 cursor-se-resize"
        title="拖动调整大小"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" className="text-white/50">
          <path d="M14 6 6 14M14 10l-4 4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </svg>
      </div>
    </motion.div>
  );
}

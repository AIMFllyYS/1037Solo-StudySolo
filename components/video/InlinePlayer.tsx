"use client";

import { useRef, useEffect } from "react";
import { MediaPlayer, MediaProvider, type MediaPlayerInstance } from "@vidstack/react";
import { DefaultVideoLayout, defaultLayoutIcons } from "@vidstack/react/player/layouts/default";
import type { VideoEntry } from "@/lib/content/types";
import { videoPoster, resolveVideoSrc } from "@/lib/content/poster";
import { PictureInPicture } from "lucide-react";

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

export interface InlinePlayerProps {
  video: VideoEntry;
  /** 切换到小窗播放时回调，传递当前播放位置 */
  onPip?: (currentTime: number) => void;
  /** 从小窗切回时的续播位置（秒） */
  startTime?: number;
}

export default function InlinePlayer({ video, onPip, startTime }: InlinePlayerProps) {
  const ref = useRef<MediaPlayerInstance>(null);
  const poster = videoPoster(video);

  useEffect(() => {
    const player = ref.current;
    if (!player) return;
    const onLoaded = () => {
      if (startTime) player.currentTime = startTime;
      player.play().catch(() => {});
    };
    player.addEventListener("can-play", onLoaded);
    return () => player.removeEventListener("can-play", onLoaded);
  }, [startTime]);

  const handlePipClick = () => {
    if (!onPip) return;
    const player = ref.current;
    if (!player) return;
    onPip(player.state.currentTime);
  };

  return (
    <div className="relative h-full w-full">
      <MediaPlayer
        ref={ref}
        load={startTime ? "eager" : "play"}
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

      {onPip && (
        <button
          onClick={handlePipClick}
          title="小窗播放"
          className="absolute right-2 top-2 z-20 grid h-8 w-8 place-items-center rounded-lg bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/70 group-hover:opacity-100 [.vds-controls:not([data-visible])_~_&]:opacity-0"
        >
          <PictureInPicture size={16} />
        </button>
      )}
    </div>
  );
}

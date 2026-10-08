import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { AuthProvider } from "@/lib/hooks/useAuthSession";
import AppShell from "@/components/layout/AppShell";
import MotionPreferenceProvider from "@/components/layout/MotionPreferenceProvider";
import { BootSplash } from "@/components/shared/LoadingStates";
import "./globals.css";
import "katex/dist/katex.min.css";
import "@vidstack/react/player/styles/base.css";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

// The old unversioned dock value may have been written by the former collapsed default.
// Keep it untouched but only hydrate a new explicit preference from the v2 key.
const bootstrapScript = `(function(){try{var d=document.documentElement,s=localStorage;var t=s.getItem('gailvlun-theme');if(t==='light'||t==='dark')d.setAttribute('data-theme',t);var sb=s.getItem('gailvlun-sidebar-collapsed');if(sb==='true'||sb==='false')d.setAttribute('data-sidebar-collapsed',sb);var tb=s.getItem('gailvlun-topbar-collapsed');if(tb==='true'||tb==='false')d.setAttribute('data-topbar-collapsed',tb);var rc=s.getItem('gailvlun-right-collapsed-by-profile'),rp=null;try{rp=rc?JSON.parse(rc):null}catch(e){}function rb(k,def){return rp&&typeof rp[k]==='boolean'?String(rp[k]):String(def)}d.setAttribute('data-right-collapsed-full',rb('full',false));d.setAttribute('data-right-collapsed-article',rb('article',true));d.setAttribute('data-right-collapsed-reference',rb('reference',false));var ad=s.getItem('gailvlun-agent-dock-collapsed-v2');d.setAttribute('data-agent-dock-collapsed',ad==='true'?'true':'false');var raw=s.getItem('gailvlun-appearance-v1'),a=null;try{a=raw?JSON.parse(raw):null}catch(e){}var modes={default:1,colorful:1,anthropic:1,ios:1,codex:1,custom:1};var fonts={system:'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Source Han Sans SC", sans-serif',songti:'"Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, Georgia, "Times New Roman", serif',kaiti:'KaiTi, STKaiti, "Kaiti SC", "LXGW WenKai", "Ma Shan Zheng", "Microsoft YaHei", cursive',hei:'"Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", "PingFang SC", Arial, sans-serif',serif:'Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", serif',mono:'"JetBrains Mono", "Cascadia Code", Consolas, "Microsoft YaHei", monospace'};var mode=a&&modes[a.mode]?a.mode:'default';var c=a&&a.custom?a.custom:{};var font=fonts[c.font]?c.font:'system';d.setAttribute('data-appearance',mode);d.setAttribute('data-font',font);function hx(v,f){return typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v)?v.toLowerCase():f}function lum(h){var r=parseInt(h.slice(1,3),16)/255,g=parseInt(h.slice(3,5),16)/255,b=parseInt(h.slice(5,7),16)/255;function cv(x){return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4)}return 0.2126*cv(r)+0.7152*cv(g)+0.0722*cv(b)}function txt(h){return lum(h)>0.24?'#111318':'#ffffff'}function set(k,v){d.style.setProperty(k,v)}if(mode==='custom'){var la=hx(c.lightAccent,'#6750a4'),da=hx(c.darkAccent,'#a8c7fa'),sel=hx(c.selection,'#ff9800'),lb=hx(c.lightBackground,'#fffbfe'),db=hx(c.darkBackground,'#131318'),lt=hx(c.lightText,'#1c1b1f'),dt=hx(c.darkText,'#e2e2e9');set('--appearance-light-bg',lb);set('--appearance-dark-bg',db);set('--appearance-light-ink',lt);set('--appearance-dark-ink',dt);set('--appearance-light-extreme',lum(lb)>0.5?'#ffffff':'#000000');set('--appearance-dark-extreme',lum(db)>0.5?'#ffffff':'#000000');set('--appearance-light-accent',la);set('--appearance-dark-accent',da);set('--appearance-light-on-accent',txt(la));set('--appearance-dark-on-accent',txt(da));set('--appearance-light-accent-container','color-mix(in srgb, '+la+' 16%, white)');set('--appearance-dark-accent-container','color-mix(in srgb, '+da+' 24%, #10131a)');set('--appearance-light-on-accent-container',txt(la));set('--appearance-dark-on-accent-container',txt(da));set('--appearance-selection',sel);set('--appearance-selection-bg','color-mix(in srgb, '+sel+' 34%, transparent)');set('--appearance-highlight-a','color-mix(in srgb, '+sel+' 28%, transparent)');set('--appearance-highlight-b','color-mix(in srgb, '+sel+' 42%, transparent)');set('--appearance-highlight-c','color-mix(in srgb, '+sel+' 30%, transparent)');set('--appearance-highlight-d','color-mix(in srgb, '+sel+' 38%, transparent)');set('--appearance-highlight-shadow','color-mix(in srgb, '+sel+' 30%, transparent)');set('--font-sans',fonts[font]);}if(mode!=='custom')set('--font-sans',fonts[font]);var so=null;try{so=JSON.parse(s.getItem('gailvlun-settings-v1'))}catch(e){}var ss=so&&so.state?so.state:so;if(ss&&ss.reduceMotion===true)d.setAttribute('data-reduce-motion','true');}catch(e){}})();`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "StudySolo · Studio",
  description:
    "课堂录音驱动的深度学习助手：详尽原创笔记、AI 对话、Manim 动画讲解与可交互内容，覆盖概率论、有机化学、近现代史等多学科。",
  appleWebApp: {
    capable: true,
    title: "StudySolo",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-256.png", sizes: "256x256", type: "image/png" },
    ],
    shortcut: "/icon-256.png",
    apple: "/icon-256.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" data-theme="light" suppressHydrationWarning>
      <head>
        {/* 在 paint 前应用本地保存的主题与布局状态，避免首屏闪烁。 */}
        <script
          dangerouslySetInnerHTML={{
            __html: bootstrapScript,
          }}
        />
      </head>
      <body>
        <Suspense fallback={<BootSplash />}>
          <AuthProvider>
            <MotionPreferenceProvider>
              <AppShell>{children}</AppShell>
            </MotionPreferenceProvider>
          </AuthProvider>
        </Suspense>
      </body>
    </html>
  );
}

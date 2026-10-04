import { useWindowManager } from "@/lib/hooks/useWindowManager";
import { translateNow } from "@/lib/i18n";

export const MEMBERSHIP_SPONSOR_WINDOW_ID = "membership-sponsor";
export const GITHUB_REPO_URL = "https://github.com/AIMFllyYS/Notebook-MedFreshman";
export const SPONSOR_EMAIL = "contact@yusheng.email";
export const SUPPORT_EMAIL = "support@1037solo.com";
export const SPONSOR_QR_SRC = "/images/sponsor-wechat.png";

export function openMembershipSponsor(): void {
  if (typeof window === "undefined") return;
  const winMgr = useWindowManager.getState();
  const existing = winMgr.windows.find((win) => win.id === MEMBERSHIP_SPONSOR_WINDOW_ID);
  if (existing) {
    if (existing.minimized) winMgr.restoreWindow(MEMBERSHIP_SPONSOR_WINDOW_ID);
    winMgr.bringToFront(MEMBERSHIP_SPONSOR_WINDOW_ID);
    return;
  }
  const width = 440;
  const height = 620;
  winMgr.openWindow({
    id: MEMBERSHIP_SPONSOR_WINDOW_ID,
    type: "membership-sponsor",
    title: translateNow("panel.membership.title"),
    pos: {
      x: Math.max(16, Math.floor(window.innerWidth / 2 - width / 2)),
      y: Math.max(16, Math.floor(window.innerHeight / 2 - height / 2)),
    },
    size: { width, height },
    data: {},
  });
}

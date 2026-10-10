import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { translateNow } from "@/lib/i18n";

const BILLING_ID = "billing-dashboard-main";

export function openBillingDashboard(): void {
  if (typeof window === "undefined") return;
  const winMgr = useWindowManager.getState();
  const existing = winMgr.windows.find((w) => w.id === BILLING_ID);
  if (existing) {
    if (existing.minimized) winMgr.restoreWindow(BILLING_ID);
    winMgr.bringToFront(BILLING_ID);
    return;
  }
  winMgr.openWindow({
    id: BILLING_ID,
    type: "billing-dashboard",
    title: translateNow("panel.billing.windowTitle"),
    pos: { x: window.innerWidth / 2 - 350, y: window.innerHeight / 2 - 250 },
    size: { width: 700, height: 500 },
    data: {},
  });
}

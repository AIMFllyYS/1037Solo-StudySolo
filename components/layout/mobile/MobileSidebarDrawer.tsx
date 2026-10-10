"use client";

import { useStore } from "@/lib/stores/ui";
import ModeSwitcher from "../navigation/ModeSwitcher";
import SubjectFolderTree from "../navigation/SubjectFolderTree";

/** 手机顶栏侧栏：左上 logo + 当前模式，下面与电脑端同一棵文件夹树。 */
export default function MobileSidebarDrawer() {
  const open = useStore((s) => s.mobileSidebarOpen);

  return (
    <aside
      className="mobile-sidebar-drawer"
      data-testid="mobile-sidebar-drawer"
      data-open={open || undefined}
      aria-hidden={!open}
      aria-label="文件夹"
    >
      <div className="mobile-sidebar-drawer-head">
        <ModeSwitcher compact stayOnStudioForAgent />
      </div>
      <SubjectFolderTree />
    </aside>
  );
}

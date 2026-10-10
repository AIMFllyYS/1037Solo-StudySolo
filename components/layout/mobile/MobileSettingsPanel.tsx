"use client";

import GlobalSettings from "../settings/GlobalSettings";

/** 手机底栏「设置」：复用桌面左下角坞菜单（登录 + 年级/成绩/快捷键/外观/Agent 设置）。 */
export default function MobileSettingsPanel() {
  return (
    <div className="mobile-settings-panel" data-testid="mobile-settings-panel">
      <GlobalSettings variant="page" onClose={() => {}} />
    </div>
  );
}

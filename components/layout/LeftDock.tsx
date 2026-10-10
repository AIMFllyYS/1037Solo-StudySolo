"use client";

import UserAvatar from "./UserAvatar";
import { resolveNickname } from "@/lib/profile/displayName";
import { useAccountProfile } from "@/lib/hooks/auth/useAccountProfile";
import { useT } from "@/lib/i18n";

export function LeftDockFace({
  email,
  signedIn,
}: {
  email?: string | null;
  signedIn?: boolean;
}) {
  const t = useT();
  const account = useAccountProfile();
  const isSignedIn = account.signedIn || Boolean(signedIn);
  const nickname = isSignedIn
    ? resolveNickname(account.signedIn ? account.nickname : null, account.email ?? email)
    : t("app.account.guest");

  return (
    <>
      <UserAvatar
        name={nickname}
        email={account.email ?? email ?? null}
        imageSrc={account.avatarSrc}
        signedIn={isSignedIn}
        size={22}
      />
      <span className="truncate text-[12.5px] font-medium">{nickname}</span>
    </>
  );
}

/** 左下角用户按钮：头像 + 昵称，点击直接打开设置面板（额度折叠在面板内，与手机设置页共用）。 */
export default function LeftDock({
  buttonRef,
  onToggle,
  settingsOpen = false,
}: {
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  onToggle: () => void;
  /** 设置面板当前是否打开，用于 aria-expanded。 */
  settingsOpen?: boolean;
}) {
  const t = useT();
  const account = useAccountProfile();
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={t("app.account.aria", { name: account.nickname })}
      aria-haspopup="dialog"
      aria-expanded={settingsOpen}
      data-testid="left-dock"
      onClick={onToggle}
      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--md-sys-color-surface-container-high)]"
      style={{
        color: "var(--md-sys-color-on-surface-variant)",
        background: "transparent",
        border: "none",
        cursor: "pointer",
      }}
    >
      <LeftDockFace />
    </button>
  );
}

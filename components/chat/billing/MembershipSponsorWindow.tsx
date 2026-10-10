"use client";

import { useCallback } from "react";
import { Heart, Mail } from "lucide-react";

function GithubMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}
import ManagedWindow from "@/components/window/ManagedWindow";
import { useWindowManager } from "@/lib/hooks/useWindowManager";
import { useT } from "@/lib/i18n/index";
import {
  GITHUB_REPO_URL,
  MEMBERSHIP_SPONSOR_WINDOW_ID,
  SPONSOR_EMAIL,
  SPONSOR_QR_SRC,
} from "@/lib/window/openMembershipSponsor";

export default function MembershipSponsorLayer() {
  const windows = useWindowManager((state) => state.windows);
  if (!windows.some((win) => win.id === MEMBERSHIP_SPONSOR_WINDOW_ID)) return null;
  return <MembershipSponsorWindow />;
}

function MembershipSponsorWindow() {
  const t = useT();
  const closeWindow = useWindowManager((state) => state.closeWindow);
  const handleClose = useCallback(() => closeWindow(MEMBERSHIP_SPONSOR_WINDOW_ID), [closeWindow]);

  return (
    <ManagedWindow
      windowId={MEMBERSHIP_SPONSOR_WINDOW_ID}
      title={t("panel.membership.title")}
      icon={<Heart size={15} />}
      onClose={handleClose}
      fullscreenTarget="notes"
      minSize={{ minW: 360, minH: 420 }}
      overlayId="membership-sponsor"
      className="membership-sponsor-window"
      testId="membership-sponsor-window"
      bodyClassName="min-h-0 flex-1 overflow-auto"
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        <p className="text-[13px] leading-6 text-[var(--ink)]">
          {t("panel.membership.intro")}
        </p>

        <a
          href="https://1037solo.com/me#data"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-[var(--line)] bg-[var(--bg-muted)] px-3.5 py-3 text-[13px] text-[var(--ink)] hover:border-[var(--md-sys-color-primary)]"
        >
          统一会员与订单中心
          <span className="mt-1 block text-[11px] text-[var(--ink-soft)]">前往 1037Solo 官网查看会员、额度及测试订单；暂未开放真实收款。</span>
        </a>

        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-muted)] px-3.5 py-3 text-[var(--ink)] hover:border-[var(--md-sys-color-primary)]"
        >
          <GithubMark size={22} />
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold">{t("panel.membership.repo")}</span>
            <span className="mt-0.5 block truncate text-[11px] text-[var(--ink-soft)]">{GITHUB_REPO_URL.replace("https://", "")}</span>
          </span>
        </a>

        <a
          href={`mailto:${SPONSOR_EMAIL}`}
          className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-muted)] px-3.5 py-3 text-[var(--ink)] hover:border-[var(--md-sys-color-primary)]"
        >
          <Mail size={20} className="shrink-0" />
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold">{t("panel.membership.contact")}</span>
            <span className="mt-0.5 block text-[11px] text-[var(--ink-soft)]">{SPONSOR_EMAIL}</span>
          </span>
        </a>

        <figure className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- local static QR, not a remote CMS image. */}
          <img
            src={SPONSOR_QR_SRC}
            alt={t("panel.membership.qrAlt")}
            className="mx-auto max-h-[280px] w-auto max-w-full rounded-lg"
          />
          <figcaption className="mt-3 text-[12px] leading-6 text-[var(--ink)]">
            {t("panel.membership.note")}
          </figcaption>
        </figure>
      </div>
    </ManagedWindow>
  );
}

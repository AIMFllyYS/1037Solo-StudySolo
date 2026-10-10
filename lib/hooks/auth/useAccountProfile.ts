"use client";

import { useEffect, useState } from "react";
import { fetchQuota } from "@/lib/billing/fetchQuota";
import { useAuthSession } from "@/lib/hooks/auth/useAuthSession";
import { fetchAccountProfile } from "@/lib/profile/client";
import { membershipLabel, resolveNickname } from "@/lib/profile/displayName";
import { useUserProfile } from "@/lib/stores/userProfile";

export function useAccountProfile() {
  const { status, email, userId } = useAuthSession();
  const avatarSrc = useUserProfile((s) => (userId ? s.avatars[userId] ?? null : null));
  const cachedNickname = useUserProfile((s) => (userId ? s.nicknames[userId] ?? null : null));
  const cacheNickname = useUserProfile((s) => s.cacheNickname);
  const [remoteMembership, setRemoteMembership] = useState<{ id: string; label: string } | null>(null);

  const nickname = status === "signedIn" ? resolveNickname(cachedNickname, email) : "访客";
  const membership = !userId
    ? "未登录"
    : remoteMembership?.id === userId
      ? remoteMembership.label
      : "免费会员";

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void fetchAccountProfile()
      .then((profile) => {
        if (cancelled || profile.userId !== userId) return;
        cacheNickname(userId, profile.nickname);
        setRemoteMembership({ id: userId, label: profile.membership });
      })
      .catch(() => {
        if (!cancelled) {
          void fetchQuota(userId)
            .then((quota) => {
              if (!cancelled) setRemoteMembership({ id: userId, label: membershipLabel(quota.tier) });
            })
            .catch(() => {});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, cacheNickname]);

  return {
    status,
    email,
    userId,
    nickname,
    avatarSrc,
    membership,
    signedIn: status === "signedIn",
  };
}

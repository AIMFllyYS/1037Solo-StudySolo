/** The shared member center, prelinked with this product and the page to come back to. */
import { accountOrigin } from "@/lib/auth/account";
import { CANONICAL_SITE_ORIGIN } from "@/lib/auth/authMode";
import { buildMembershipUrl } from "@/lib/membership/presentation";

export function membershipCenterHref(): string {
  const returnTo = typeof window !== "undefined" ? window.location.href : `${CANONICAL_SITE_ORIGIN}/`;
  return buildMembershipUrl(accountOrigin(), { source: "studysolo", returnTo });
}

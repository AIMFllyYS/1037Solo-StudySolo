import type { Metadata } from "next";
import ReviewWorkspace from "@/components/review-mode/ReviewWorkspace";
import { appModeTitle } from "@/lib/constants/app-mode";

export const metadata: Metadata = {
  title: appModeTitle("review"),
};

export default function ReviewPage() {
  return <ReviewWorkspace />;
}

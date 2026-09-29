import type { Metadata } from "next";
import { Suspense } from "react";
import ReviewWorkspace from "@/components/review-mode/ReviewWorkspace";
import { appModeTitle } from "@/lib/constants/app-mode";

export const metadata: Metadata = {
  title: appModeTitle("review"),
};

export default function ReviewPage() {
  // ReviewWorkspace 读取 useSearchParams：需要 Suspense 边界，否则静态渲染会整页退化为客户端渲染。
  return (
    <Suspense fallback={null}>
      <ReviewWorkspace />
    </Suspense>
  );
}

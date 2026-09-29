import type { Metadata } from "next";
import ClassEntry from "@/classolo/ClassEntry";
import { appModeTitle } from "@/lib/constants/app-mode";

export const metadata: Metadata = {
  title: appModeTitle("class"),
};

export default function ClassPage() {
  return <ClassEntry />;
}

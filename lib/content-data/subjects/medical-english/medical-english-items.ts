import type { ContentItem } from "@/lib/types/content";

/** 课内单元：词根课件 + Text A 译文 + Unit 6/7 教学文件。id 走 chapter-prefix。 */
export const medicalEnglishTextbookItems: ContentItem[] = [
  { id: "ch01", title: "Lesson 1 · Medical Professionalism / 词根入门", type: "document", status: "done" },
  { id: "ch06", title: "Lesson 6 · Gender, climate change and health", type: "document", status: "done" },
  { id: "ch07", title: "Lesson 7 · Social Medicine", type: "document", status: "done" },
  { id: "ch08", title: "Lesson 8 · Health effects of 9/11", type: "document", status: "done" },
  { id: "ch12", title: "Lesson 12 · Medical Ethics", type: "document", status: "done" },
];

export const medicalEnglishDetailItems: ContentItem[] = [
  { id: "1.1", title: "Medical Terminology 词汇包 · 词缀分类详解", type: "document", status: "done" },
];

export const medicalEnglishKaoqianItems: ContentItem[] = [
  { id: "sim-01", title: "15 级医学英语样题", type: "document", status: "done" },
  { id: "sim-02", title: "Examination Paper 样题", type: "document", status: "done" },
  { id: "sim-03", title: "MedEnglish 样题", type: "document", status: "done" },
  { id: "sim-04", title: "MedEnglish 样题 2018.11", type: "document", status: "done" },
  { id: "sim-05", title: "医学英语试卷扫描 Paper", type: "document", status: "done" },
];

export const medicalEnglishShizhanItems: ContentItem[] = [
  { id: "real-01", title: "医学英语 2021 试卷", type: "document", status: "done" },
  { id: "real-02", title: "医学英语历年真题", type: "document", status: "done" },
];

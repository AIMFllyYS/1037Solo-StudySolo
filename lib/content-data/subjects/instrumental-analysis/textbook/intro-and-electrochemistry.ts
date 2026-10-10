import type { ContentItem } from "@/lib/types/content";

export const introAndElectrochemistryItems: ContentItem[] = [
  {
    id: "toc",
    title: "目录",
    type: "document",
    status: "done",
    summary: "教材目录。",
  },
  {
    id: "ch01",
    title: "第1章　绪论",
    type: "section",
    status: "done",
    summary: "第1章　绪论",
    children: [
      {
        id: "ch01-1",
        title: "第1节　化学分析与仪器分析",
        type: "document",
        status: "done",
      },
      {
        id: "ch01-2",
        title: "第2节　仪器分析法的类型",
        type: "document",
        status: "done",
      },
      {
        id: "ch01-3",
        title: "第3节　仪器分析的发展沿革",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch02",
    title: "第2章　电位分析法和永停滴定法",
    type: "section",
    status: "done",
    summary: "第2章　电位分析法和永停滴定法",
    children: [
      {
        id: "ch02-1",
        title: "第1节　电化学分析法概述",
        type: "document",
        status: "done",
      },
      {
        id: "ch02-2",
        title: "第2节　电位分析法的基本原理",
        type: "document",
        status: "done",
      },
      {
        id: "ch02-3",
        title: "第3节　直接电位法",
        type: "document",
        status: "done",
      },
      {
        id: "ch02-4",
        title: "第4节　电位滴定法",
        type: "document",
        status: "done",
      },
      {
        id: "ch02-5",
        title: "第5节　永停滴定法",
        type: "document",
        status: "done",
      },
      {
        id: "ch02-6",
        title: "第6节　电化学分析新方法简介",
        type: "document",
        status: "done",
      }
    ],
  },
];

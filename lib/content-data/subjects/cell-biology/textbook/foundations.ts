import type { ContentItem } from "@/lib/types/content";

export const foundationsItems: ContentItem[] = [
  {
    id: "toc",
    title: "目录",
    type: "document",
    status: "done",
    summary: "教材目录。",
  },
  {
    id: "ch01",
    title: "第一章　绪论",
    type: "section",
    status: "done",
    summary: "第一章　绪论",
    children: [
      {
        id: "ch01-1",
        title: "第一节　细胞生物学概述",
        type: "document",
        status: "done",
      },
      {
        id: "ch01-2",
        title: "第二节　细胞生物学的形成与发展趋势",
        type: "document",
        status: "done",
      },
      {
        id: "ch01-3",
        title: "第三节　细胞生物学与医学",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch02",
    title: "第二章　细胞的概念与分子基础",
    type: "section",
    status: "done",
    summary: "第二章　细胞的概念与分子基础",
    children: [
      {
        id: "ch02-1",
        title: "第一节　细胞的基本概念",
        type: "document",
        status: "done",
      },
      {
        id: "ch02-2",
        title: "第二节　细胞的分子基础",
        type: "document",
        status: "done",
      },
      {
        id: "ch02-3",
        title: "第三节　细胞的起源与进化",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch03",
    title: "第三章　细胞生物学的研究方法",
    type: "section",
    status: "done",
    summary: "第三章　细胞生物学的研究方法",
    children: [
      {
        id: "ch03-1",
        title: "第一节　显微镜技术",
        type: "document",
        status: "done",
      },
      {
        id: "ch03-2",
        title: "第二节　细胞的分离和培养",
        type: "document",
        status: "done",
      },
      {
        id: "ch03-3",
        title: "第三节　细胞组分的分离和纯化技术",
        type: "document",
        status: "done",
      },
      {
        id: "ch03-4",
        title: "第四节　细胞化学和细胞内分子示踪技术",
        type: "document",
        status: "done",
      },
      {
        id: "ch03-5",
        title: "第五节　细胞功能基因组学研究技术",
        type: "document",
        status: "done",
      }
    ],
  },
];

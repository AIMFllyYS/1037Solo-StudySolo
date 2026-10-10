import type { ContentItem } from '@/lib/types/content';

export const anatomyTextbookItems: ContentItem[] = [
  {
    id: "toc",
    title: "目录",
    type: "document",
    status: "done",
    summary: "教材目录。",
  },
  {
    id: "ch00",
    title: "绪论",
    type: "section",
    status: "done",
    summary: "绪论",
    children: [
      {
        id: "ch00-1",
        title: "一、 人体解剖学的定义和地位",
        type: "document",
        status: "done",
      },
      {
        id: "ch00-2",
        title: "二、 人体解剖学的分科",
        type: "document",
        status: "done",
      },
      {
        id: "ch00-3",
        title: "三、 人体解剖学发展简史",
        type: "document",
        status: "done",
      },
      {
        id: "ch00-4",
        title: "四、 人体的组成与器官系统",
        type: "document",
        status: "done",
      },
      {
        id: "ch00-5",
        title: "五、 解剖学姿势、方位术语与人体的轴和面",
        type: "document",
        status: "done",
      },
      {
        id: "ch00-6",
        title: "六、 人体器官的变异与畸形",
        type: "document",
        status: "done",
      },
      {
        id: "ch00-7",
        title: "七、 学习人体解剖学的方法",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch01",
    title: "第一章 运动系统",
    type: "section",
    status: "done",
    summary: "第一章 运动系统",
    children: [
      {
        id: "ch01-1",
        title: "第一节　骨",
        type: "document",
        status: "done",
      },
      {
        id: "ch01-2",
        title: "第二节　骨连结",
        type: "document",
        status: "done",
      },
      {
        id: "ch01-3",
        title: "第三节　骨骼肌",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch02",
    title: "第二章 消化系统",
    type: "section",
    status: "done",
    summary: "第二章 消化系统",
    children: [
      {
        id: "ch02-1",
        title: "第一节　消化管",
        type: "document",
        status: "done",
      },
      {
        id: "ch02-2",
        title: "第二节　消化腺",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch03",
    title: "第三章 呼吸系统",
    type: "section",
    status: "done",
    summary: "第三章 呼吸系统",
    children: [
      {
        id: "ch03-1",
        title: "第一节　呼吸道",
        type: "document",
        status: "done",
      },
      {
        id: "ch03-2",
        title: "第二节　肺",
        type: "document",
        status: "done",
      },
      {
        id: "ch03-3",
        title: "第三节　胸膜",
        type: "document",
        status: "done",
      },
      {
        id: "ch03-4",
        title: "第四节　纵隔",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch04",
    title: "第四章 泌尿系统",
    type: "section",
    status: "done",
    summary: "第四章 泌尿系统",
    children: [
      {
        id: "ch04-1",
        title: "第一节　肾",
        type: "document",
        status: "done",
      },
      {
        id: "ch04-2",
        title: "第二节　输尿管",
        type: "document",
        status: "done",
      },
      {
        id: "ch04-3",
        title: "第三节　膀胱",
        type: "document",
        status: "done",
      },
      {
        id: "ch04-4",
        title: "第四节　尿道",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch05",
    title: "第五章 生殖系统",
    type: "section",
    status: "done",
    summary: "第五章 生殖系统",
    children: [
      {
        id: "ch05-1",
        title: "第一节　男性生殖系统",
        type: "document",
        status: "done",
      },
      {
        id: "ch05-2",
        title: "第二节　女性生殖系统",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch06",
    title: "第六章 内分泌系统",
    type: "section",
    status: "done",
    summary: "第六章 内分泌系统",
    children: [
      {
        id: "ch06-1",
        title: "一、 垂体",
        type: "document",
        status: "done",
      },
      {
        id: "ch06-2",
        title: "二、 松果体",
        type: "document",
        status: "done",
      },
      {
        id: "ch06-3",
        title: "三、 甲状腺",
        type: "document",
        status: "done",
      },
      {
        id: "ch06-4",
        title: "四、 甲状旁腺",
        type: "document",
        status: "done",
      },
      {
        id: "ch06-5",
        title: "五、 肾上腺",
        type: "document",
        status: "done",
      },
      {
        id: "ch06-6",
        title: "六、 胸腺",
        type: "document",
        status: "done",
      },
      {
        id: "ch06-7",
        title: "七、 生殖腺",
        type: "document",
        status: "done",
      },
      {
        id: "ch06-8",
        title: "八、 胰岛",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch07",
    title: "第七章 脉管系统",
    type: "section",
    status: "done",
    summary: "第七章 脉管系统",
    children: [
      {
        id: "ch07-1",
        title: "第一节　心血管系统",
        type: "document",
        status: "done",
      },
      {
        id: "ch07-2",
        title: "第二节　淋巴系统",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch08",
    title: "第八章 感觉器",
    type: "section",
    status: "done",
    summary: "第八章 感觉器",
    children: [
      {
        id: "ch08-1",
        title: "第一节　视器",
        type: "document",
        status: "done",
      },
      {
        id: "ch08-2",
        title: "第二节　前庭蜗器",
        type: "document",
        status: "done",
      },
      {
        id: "ch08-3",
        title: "第三节　其他感觉器",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch09",
    title: "第九章 神经系统",
    type: "section",
    status: "done",
    summary: "第九章 神经系统",
    children: [
      {
        id: "ch09-1",
        title: "第一节　总论",
        type: "document",
        status: "done",
      },
      {
        id: "ch09-2",
        title: "第二节　中枢神经系统",
        type: "document",
        status: "done",
      },
      {
        id: "ch09-3",
        title: "第三节　周围神经系统",
        type: "document",
        status: "done",
      },
      {
        id: "ch09-4",
        title: "第四节　神经系统的传导通路",
        type: "document",
        status: "done",
      }
    ],
  }
];

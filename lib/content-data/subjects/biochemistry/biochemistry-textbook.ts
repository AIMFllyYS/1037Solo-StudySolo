import type { ContentItem } from '@/lib/types/content';

export const biochemistryTextbookItems: ContentItem[] = [
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
        title: "第一节　生物化学与分子生物学发展简史",
        type: "document",
        status: "done",
      },
      {
        id: "ch00-2",
        title: "第二节　当代生物化学与分子生物学研究的主要内容",
        type: "document",
        status: "done",
      },
      {
        id: "ch00-3",
        title: "第三节　生物化学与分子生物学是生物学、医学的基础和前沿学科",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch01",
    title: "第一章　蛋白质的结构与功能",
    type: "section",
    status: "done",
    summary: "第一章　蛋白质的结构与功能",
    children: [
      {
        id: "ch01-1",
        title: "第一节　蛋白质的分子组成",
        type: "document",
        status: "done",
      },
      {
        id: "ch01-2",
        title: "第二节　蛋白质的分子结构",
        type: "document",
        status: "done",
      },
      {
        id: "ch01-3",
        title: "第三节　蛋白质结构与功能的关系",
        type: "document",
        status: "done",
      },
      {
        id: "ch01-4",
        title: "第四节　蛋白质的理化性质",
        type: "document",
        status: "done",
      },
      {
        id: "ch01-5",
        title: "第五节　蛋白质的分离、纯化与结构分析",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch02",
    title: "第二章　酶与酶促反应",
    type: "section",
    status: "done",
    summary: "第二章　酶与酶促反应",
    children: [
      {
        id: "ch02-1",
        title: "第一节　酶的分子结构与功能",
        type: "document",
        status: "done",
      },
      {
        id: "ch02-2",
        title: "第二节　酶的工作原理",
        type: "document",
        status: "done",
      },
      {
        id: "ch02-3",
        title: "第三节　酶促反应动力学",
        type: "document",
        status: "done",
      },
      {
        id: "ch02-4",
        title: "第四节　酶的调节",
        type: "document",
        status: "done",
      },
      {
        id: "ch02-5",
        title: "第五节　酶的分类与命名",
        type: "document",
        status: "done",
      },
      {
        id: "ch02-6",
        title: "第六节　酶在医学中的应用",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch03",
    title: "第三章　核酸的结构与功能",
    type: "section",
    status: "done",
    summary: "第三章　核酸的结构与功能",
    children: [
      {
        id: "ch03-1",
        title: "第一节　核酸的化学组成及其一级结构",
        type: "document",
        status: "done",
      },
      {
        id: "ch03-2",
        title: "第二节　DNA的空间结构与功能",
        type: "document",
        status: "done",
      },
      {
        id: "ch03-3",
        title: "第三节　RNA的空间结构与功能",
        type: "document",
        status: "done",
      },
      {
        id: "ch03-4",
        title: "第四节　核酸的理化性质",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch04",
    title: "第四章　糖蛋白和蛋白聚糖的结构与功能",
    type: "section",
    status: "done",
    summary: "第四章　糖蛋白和蛋白聚糖的结构与功能",
    children: [
      {
        id: "ch04-1",
        title: "第一节　糖蛋白分子中的聚糖",
        type: "document",
        status: "done",
      },
      {
        id: "ch04-2",
        title: "第二节　蛋白聚糖分子中的糖胺聚糖",
        type: "document",
        status: "done",
      },
      {
        id: "ch04-3",
        title: "第三节　聚糖结构蕴藏大量生物信息",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch05",
    title: "第五章　水和无机元素",
    type: "section",
    status: "done",
    summary: "第五章　水和无机元素",
    children: [
      {
        id: "ch05-1",
        title: "第一节　水",
        type: "document",
        status: "done",
      },
      {
        id: "ch05-2",
        title: "第二节　无机元素",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch06",
    title: "第六章　维生素",
    type: "section",
    status: "done",
    summary: "第六章　维生素",
    children: [
      {
        id: "ch06-1",
        title: "第一节　脂溶性维生素",
        type: "document",
        status: "done",
      },
      {
        id: "ch06-2",
        title: "第二节　水溶性维生素",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch07",
    title: "第七章　糖代谢",
    type: "section",
    status: "done",
    summary: "第七章　糖代谢",
    children: [
      {
        id: "ch07-1",
        title: "第一节　糖的摄取与利用",
        type: "document",
        status: "done",
      },
      {
        id: "ch07-2",
        title: "第二节　糖的无氧氧化",
        type: "document",
        status: "done",
      },
      {
        id: "ch07-3",
        title: "第三节　糖的有氧氧化",
        type: "document",
        status: "done",
      },
      {
        id: "ch07-4",
        title: "第四节　戊糖磷酸途径",
        type: "document",
        status: "done",
      },
      {
        id: "ch07-5",
        title: "第五节　糖原的合成与分解",
        type: "document",
        status: "done",
      },
      {
        id: "ch07-6",
        title: "第六节　糖异生",
        type: "document",
        status: "done",
      },
      {
        id: "ch07-7",
        title: "第七节　葡萄糖的其他代谢途径",
        type: "document",
        status: "done",
      },
      {
        id: "ch07-8",
        title: "第八节　血糖及其调节",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch08",
    title: "第八章　脂质代谢",
    type: "section",
    status: "done",
    summary: "第八章　脂质代谢",
    children: [
      {
        id: "ch08-1",
        title: "第一节　脂质的构成、功能及分析",
        type: "document",
        status: "done",
      },
      {
        id: "ch08-2",
        title: "第二节　脂质的消化与吸收",
        type: "document",
        status: "done",
      },
      {
        id: "ch08-3",
        title: "第三节　甘油三酯代谢",
        type: "document",
        status: "done",
      },
      {
        id: "ch08-4",
        title: "第四节　磷脂代谢",
        type: "document",
        status: "done",
      },
      {
        id: "ch08-5",
        title: "第五节　胆固醇代谢",
        type: "document",
        status: "done",
      },
      {
        id: "ch08-6",
        title: "第六节　血浆脂蛋白及其代谢",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch09",
    title: "第九章　氨基酸代谢",
    type: "section",
    status: "done",
    summary: "第九章　氨基酸代谢",
    children: [
      {
        id: "ch09-1",
        title: "第一节　营养必需氨基酸与氨基酸代谢概述",
        type: "document",
        status: "done",
      },
      {
        id: "ch09-2",
        title: "第二节　氨基酸的一般代谢",
        type: "document",
        status: "done",
      },
      {
        id: "ch09-3",
        title: "第三节　氨的代谢",
        type: "document",
        status: "done",
      },
      {
        id: "ch09-4",
        title: "第四节　个别氨基酸的代谢",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch10",
    title: "第十章　生物氧化",
    type: "section",
    status: "done",
    summary: "第十章　生物氧化",
    children: [
      {
        id: "ch10-1",
        title: "第一节　生物氧化与能量代谢",
        type: "document",
        status: "done",
      },
      {
        id: "ch10-2",
        title: "第二节　线粒体氧化体系与氧化呼吸链",
        type: "document",
        status: "done",
      },
      {
        id: "ch10-3",
        title: "第三节　氧化磷酸化与ATP的生成",
        type: "document",
        status: "done",
      },
      {
        id: "ch10-4",
        title: "第四节　氧化磷酸化的影响因素",
        type: "document",
        status: "done",
      },
      {
        id: "ch10-5",
        title: "第五节　其他氧化与抗氧化体系",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch11",
    title: "第十一章　核苷酸代谢",
    type: "section",
    status: "done",
    summary: "第十一章　核苷酸代谢",
    children: [
      {
        id: "ch11-1",
        title: "第一节　核苷酸代谢概述",
        type: "document",
        status: "done",
      },
      {
        id: "ch11-2",
        title: "第二节　嘌呤核苷酸的合成与分解代谢",
        type: "document",
        status: "done",
      },
      {
        id: "ch11-3",
        title: "第三节　嘧啶核苷酸的合成与分解代谢",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch12",
    title: "第十二章　代谢的整合与调节",
    type: "section",
    status: "done",
    summary: "第十二章　代谢的整合与调节",
    children: [
      {
        id: "ch12-1",
        title: "第一节　代谢的特点",
        type: "document",
        status: "done",
      },
      {
        id: "ch12-2",
        title: "第二节　代谢的相互联系",
        type: "document",
        status: "done",
      },
      {
        id: "ch12-3",
        title: "第三节　代谢调节的主要方式",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch13",
    title: "第十三章　真核基因与基因组",
    type: "section",
    status: "done",
    summary: "第十三章　真核基因与基因组",
    children: [
      {
        id: "ch13-1",
        title: "第一节　真核基因的结构与功能",
        type: "document",
        status: "done",
      },
      {
        id: "ch13-2",
        title: "第二节　真核基因组的结构与功能",
        type: "document",
        status: "done",
      },
      {
        id: "ch13-3",
        title: "第三节　基因组学",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch14",
    title: "第十四章　DNA的合成",
    type: "section",
    status: "done",
    summary: "第十四章　DNA的合成",
    children: [
      {
        id: "ch14-1",
        title: "第一节　DNA复制的基本规律",
        type: "document",
        status: "done",
      },
      {
        id: "ch14-2",
        title: "第二节　DNA复制的酶学和拓扑学",
        type: "document",
        status: "done",
      },
      {
        id: "ch14-3",
        title: "第三节　原核生物DNA复制过程",
        type: "document",
        status: "done",
      },
      {
        id: "ch14-4",
        title: "第四节　真核生物DNA复制过程",
        type: "document",
        status: "done",
      },
      {
        id: "ch14-5",
        title: "第五节　逆转录",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch15",
    title: "第十五章　RNA的生物合成",
    type: "section",
    status: "done",
    summary: "第十五章　RNA的生物合成",
    children: [
      {
        id: "ch15-1",
        title: "第一节　RNA的生物合成概述",
        type: "document",
        status: "done",
      },
      {
        id: "ch15-2",
        title: "第二节　原核生物的转录",
        type: "document",
        status: "done",
      },
      {
        id: "ch15-3",
        title: "第三节　真核生物mRNA的转录、加工和降解",
        type: "document",
        status: "done",
      },
      {
        id: "ch15-4",
        title: "第四节　真核生物非编码RNA的生物合成",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch16",
    title: "第十六章　蛋白质的合成",
    type: "section",
    status: "done",
    summary: "第十六章　蛋白质的合成",
    children: [
      {
        id: "ch16-1",
        title: "第一节　蛋白质合成体系",
        type: "document",
        status: "done",
      },
      {
        id: "ch16-2",
        title: "第二节　肽链的合成过程",
        type: "document",
        status: "done",
      },
      {
        id: "ch16-3",
        title: "第三节　蛋白质合成后的加工和靶向输送",
        type: "document",
        status: "done",
      },
      {
        id: "ch16-4",
        title: "第四节　蛋白质合成的干扰和抑制",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch17",
    title: "第十七章　基因表达调控",
    type: "section",
    status: "done",
    summary: "第十七章　基因表达调控",
    children: [
      {
        id: "ch17-1",
        title: "第一节　基因表达调控的基本概念与特点",
        type: "document",
        status: "done",
      },
      {
        id: "ch17-2",
        title: "第二节　原核基因表达调控",
        type: "document",
        status: "done",
      },
      {
        id: "ch17-3",
        title: "第三节　真核基因表达调控",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch18",
    title: "第十八章　常用的分子生物学技术",
    type: "section",
    status: "done",
    summary: "第十八章　常用的分子生物学技术",
    children: [
      {
        id: "ch18-1",
        title: "第一节　印迹法和探针技术",
        type: "document",
        status: "done",
      },
      {
        id: "ch18-2",
        title: "第二节　聚合酶链反应技术",
        type: "document",
        status: "done",
      },
      {
        id: "ch18-3",
        title: "第三节　DNA测序技术",
        type: "document",
        status: "done",
      },
      {
        id: "ch18-4",
        title: "第四节　生物分子相互作用研究技术",
        type: "document",
        status: "done",
      },
      {
        id: "ch18-5",
        title: "第五节　基因表达分析技术",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch19",
    title: "第十九章　DNA重组和重组DNA技术",
    type: "section",
    status: "done",
    summary: "第十九章　DNA重组和重组DNA技术",
    children: [
      {
        id: "ch19-1",
        title: "第一节　自然界的DNA重组和基因转移",
        type: "document",
        status: "done",
      },
      {
        id: "ch19-2",
        title: "第二节　重组DNA技术",
        type: "document",
        status: "done",
      },
      {
        id: "ch19-3",
        title: "第三节　重组DNA技术在医学中的应用",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch20",
    title: "第二十章　细胞信号转导与疾病",
    type: "section",
    status: "done",
    summary: "第二十章　细胞信号转导与疾病",
    children: [
      {
        id: "ch20-1",
        title: "第一节　细胞信号转导概述",
        type: "document",
        status: "done",
      },
      {
        id: "ch20-2",
        title: "第二节　细胞内信号转导分子",
        type: "document",
        status: "done",
      },
      {
        id: "ch20-3",
        title: "第三节　细胞受体介导的细胞内信号转导",
        type: "document",
        status: "done",
      },
      {
        id: "ch20-4",
        title: "第四节　细胞信号转导的基本规律",
        type: "document",
        status: "done",
      },
      {
        id: "ch20-5",
        title: "第五节　细胞信号转导异常与疾病",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch21",
    title: "第二十一章　DNA损伤和损伤修复",
    type: "section",
    status: "done",
    summary: "第二十一章　DNA损伤和损伤修复",
    children: [
      {
        id: "ch21-1",
        title: "第一节　DNA损伤",
        type: "document",
        status: "done",
      },
      {
        id: "ch21-2",
        title: "第二节　DNA损伤修复",
        type: "document",
        status: "done",
      },
      {
        id: "ch21-3",
        title: "第三节　DNA损伤和损伤修复的意义",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch22",
    title: "第二十二章　疾病相关基因",
    type: "section",
    status: "done",
    summary: "第二十二章　疾病相关基因",
    children: [
      {
        id: "ch22-1",
        title: "第一节　疾病相关基因及其鉴定原则",
        type: "document",
        status: "done",
      },
      {
        id: "ch22-2",
        title: "第二节　疾病相关基因鉴定的方法",
        type: "document",
        status: "done",
      },
      {
        id: "ch22-3",
        title: "第三节　疾病相关基因与分子医学",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch23",
    title: "第二十三章　癌症的分子基础",
    type: "section",
    status: "done",
    summary: "第二十三章　癌症的分子基础",
    children: [
      {
        id: "ch23-1",
        title: "第一节　癌症分子基础概述",
        type: "document",
        status: "done",
      },
      {
        id: "ch23-2",
        title: "第二节　癌基因",
        type: "document",
        status: "done",
      },
      {
        id: "ch23-3",
        title: "第三节　抑癌基因",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch24",
    title: "第二十四章　基因诊断和基因治疗",
    type: "section",
    status: "done",
    summary: "第二十四章　基因诊断和基因治疗",
    children: [
      {
        id: "ch24-1",
        title: "第一节　基因诊断",
        type: "document",
        status: "done",
      },
      {
        id: "ch24-2",
        title: "第二节　基因治疗",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch25",
    title: "第二十五章　肝的生物化学",
    type: "section",
    status: "done",
    summary: "第二十五章　肝的生物化学",
    children: [
      {
        id: "ch25-1",
        title: "第一节　肝在物质代谢中的作用",
        type: "document",
        status: "done",
      },
      {
        id: "ch25-2",
        title: "第二节　肝的生物转化作用",
        type: "document",
        status: "done",
      },
      {
        id: "ch25-3",
        title: "第三节　胆汁与胆汁酸的代谢",
        type: "document",
        status: "done",
      },
      {
        id: "ch25-4",
        title: "第四节　胆色素的代谢与黄疸",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch26",
    title: "第二十六章　血液的生物化学",
    type: "section",
    status: "done",
    summary: "第二十六章　血液的生物化学",
    children: [
      {
        id: "ch26-1",
        title: "第一节　血浆蛋白质",
        type: "document",
        status: "done",
      },
      {
        id: "ch26-2",
        title: "第二节　血红素的合成",
        type: "document",
        status: "done",
      },
      {
        id: "ch26-3",
        title: "第三节　血细胞物质代谢",
        type: "document",
        status: "done",
      }
    ],
  },
  {
    id: "ch27",
    title: "第二十七章　其他重要器官和组织的生物化学",
    type: "section",
    status: "done",
    summary: "第二十七章　其他重要器官和组织的生物化学",
    children: [
      {
        id: "ch27-1",
        title: "第一节　脑的生物化学",
        type: "document",
        status: "done",
      },
      {
        id: "ch27-2",
        title: "第二节　心肌的生物化学",
        type: "document",
        status: "done",
      },
      {
        id: "ch27-3",
        title: "第三节　肾的生物化学",
        type: "document",
        status: "done",
      },
      {
        id: "ch27-4",
        title: "第四节　骨骼肌的生物化学",
        type: "document",
        status: "done",
      },
      {
        id: "ch27-5",
        title: "第五节　脂肪组织的生物化学",
        type: "document",
        status: "done",
      }
    ],
  }
];

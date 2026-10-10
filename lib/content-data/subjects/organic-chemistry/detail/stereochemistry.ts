import type { ContentItem } from "@/lib/types/content";

export const stereochemistryItems: ContentItem[] = [
  {
    id: 'ch09',
    title: '立体化学与手性',
    type: 'section',
    status: 'done',
    summary: '对称性与手性碳；对映/非对映/内消旋/外消旋；Fisher 投影式与 R/S 绝对构型。',
    children: [
      {
        id: '9.1',
        title: '对称性与手性、手性碳原子',
        type: 'section',
        status: 'done',
        summary:
          '对称中心/对称面；手性的本质（缺对称因素）与旋光性的区别；手性碳原子（四个不同取代基）的产生。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '9.2',
        title: '对映异构、非对映、内消旋与外消旋',
        type: 'section',
        status: 'done',
        summary:
          '含一个手性碳→对映异构体；含两个手性碳→对映/非对映；内消旋体（分子内对称面、纯净物无旋光）vs 外消旋体（等量混合物）；无手性碳但有手性的分子（联苯/丙二烯/螺环/手性氮硫）。',
        videoIds: [],
        interactiveIds: [],
      },
      {
        id: '9.3',
        title: 'Fisher 投影式与 R/S 绝对构型',
        type: 'section',
        status: 'done',
        summary:
          'Fisher 投影三原则与旋转规则；顺序规则定优先级；R/S 判断步骤（排序→隐最小基→大中小转向）；从 Fisher 式到绝对构型；生物活性分子构型。',
        videoIds: [],
        interactiveIds: [],
      },
    ],
  },
];

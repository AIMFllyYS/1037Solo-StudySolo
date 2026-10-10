import type { LectureMeta } from '../../recordings';

/** 概率论课堂录音讲次。rec-XX / sum-XX 由 recordings.ts 派生。 */
export const probabilityLectures: readonly LectureMeta[] = [
  { id: '01', title: '第一节·课程导论与概率史' },
  { id: '02', title: '第二节·事件代数与概率公理' },
  { id: '03', title: '第三节·条件概率与贝叶斯' },
  { id: '04', title: '第四节·离散随机变量与常见分布' },
  { id: '07', title: '第七节·正态分布与连续分布' },
  { id: '08', title: '第八节·多维随机变量与联合分布' },
  { id: '09', title: '第九节·边缘分布与条件分布' },
  { id: '10', title: '第十节·独立性与多维函数分布' },
  { id: '11', title: '第十一节·多维总结与期望引入' },
  { id: '12', title: '第十二节·期望性质与柯西不等式' },
  { id: '13', title: '第十三节·方差与标准化' },
  { id: '14', title: '第十四节·相关系数与大数定律' },
  { id: '15', title: '第十五节·大数定律与中心极限定理' },
  { id: '16', title: '第十六节·样本与抽样分布' },
  { id: '17', title: '第十七节·三大分布与分位点' },
];

import type { ContentTree } from '@/lib/types/content';
import { subjectHeader } from './subjects.registry';
import { category, stubCategory, stubTextbookItem } from './category-templates';
import { probabilityDetailItems } from './subjects/probability/probability-detail';
import { modernHistoryDetailItems } from './subjects/modern-history/modern-history-detail';
import { modernHistoryTextbookItems } from './subjects/modern-history/modern-history-textbook';
import { organicChemistryDetailItems } from './subjects/organic-chemistry/organic-chemistry-detail';
import { chemistryLectures } from './subjects/chemistry/chemistry-lectures';
import { maogaiDetailItems } from './subjects/maogai/maogai-detail';
import { maogaiLectures } from './subjects/maogai/maogai-lectures';
import { maogaiTextbookItems } from './subjects/maogai/maogai-textbook';
import { physicsDetailItems } from './subjects/physics/physics-detail';
import { physicsLectures } from './subjects/physics/physics-lectures';
import { probabilityLectures } from './subjects/probability/probability-lectures';
import { modernHistoryLectures } from './subjects/modern-history/modern-history-lectures';
import { recordingItems, summaryItems } from './recordings';
import { sophomoreCategorySkeleton, sophomoreCategories } from './sophomore-categories';
import { cellBiologyTextbookItems } from './subjects/cell-biology/cell-biology-textbook';
import { biochemistryTextbookItems } from './subjects/biochemistry/biochemistry-textbook';
import { anatomyTextbookItems } from './subjects/anatomy/anatomy-textbook';
import { histologyTextbookItems } from './subjects/histology/histology-textbook';
import { instrumentalAnalysisTextbookItems } from './subjects/instrumental-analysis/instrumental-analysis-textbook';
import { medicalEnglishTextbookItems, medicalEnglishDetailItems, medicalEnglishKaoqianItems, medicalEnglishShizhanItems } from './subjects/medical-english/medical-english-items';
import { medicalStatisticsTextbookItems, medicalStatisticsDetailItems, medicalStatisticsKaoqianItems } from './subjects/medical-statistics/medical-statistics-items';
import { cellBiologyLabTextbookItems } from './subjects/cell-biology-lab/cell-biology-lab-items';
import { biochemistryDetailItems, biochemistrySummaryItems, biochemistryKaoqianItems, biochemistryShizhanItems } from './subjects/biochemistry/biochemistry-extras';
import { anatomyDetailItems, anatomyKaoqianItems, anatomyShizhanItems } from './subjects/anatomy/anatomy-extras';
import { histologyDetailItems, histologyKaoqianItems, histologyShizhanItems } from './subjects/histology/histology-extras';
import { hasLectures, lectureNavGroupsBySubject, lectureSummaryLeavesBySubject } from './lectures';


const physicsKaoqianMoniItems = [
  { id: 'sim-01', title: '大学物理期末模拟试卷一（押题A卷）', type: 'document' as const, status: 'done' as const },
  { id: 'sim-02', title: '大学物理期末模拟试卷二（押题B卷）', type: 'document' as const, status: 'done' as const },
  { id: 'sim-03', title: '大学物理期末模拟试卷三（押题C卷）', type: 'document' as const, status: 'done' as const },
  { id: 'sim-04', title: '大学物理期末模拟试卷四（华科第一套）', type: 'document' as const, status: 'done' as const },
  { id: 'sim-05', title: '大学物理期末模拟试卷五（华科第二套）', type: 'document' as const, status: 'done' as const },
  { id: 'sim-06', title: '大学物理期末模拟试卷六（华科第三套）', type: 'document' as const, status: 'done' as const },
];

const chemistryKaoqianMoniItems = [
  { id: 'sim-01', title: '有机化学期末模拟试卷一', type: 'document' as const, status: 'done' as const },
  { id: 'sim-02', title: '有机化学期末模拟试卷二', type: 'document' as const, status: 'done' as const },
  { id: 'sim-03', title: '有机化学期末模拟试卷三', type: 'document' as const, status: 'done' as const },
  { id: 'real-01', title: '有机化学期末真题模拟卷（一）', type: 'document' as const, status: 'done' as const },
  { id: 'real-02', title: '有机化学期末真题模拟卷（二）', type: 'document' as const, status: 'done' as const },
  { id: 'real-03', title: '有机化学期末真题模拟卷（三）', type: 'document' as const, status: 'done' as const },
  { id: 'real-04', title: '华中科技大学有机化学期末真题（四）2021-2022', type: 'document' as const, status: 'done' as const },
  { id: 'real-05', title: '华中科技大学有机化学期末真题（五）2023-2024', type: 'document' as const, status: 'done' as const },
];

const maogaiShizhanYanlianItems = [
  { id: 'maogai-practice-unit-intro-01', title: '导论·马克思主义中国化单元真题训练', type: 'document' as const, status: 'done' as const },
  { id: 'maogai-practice-unit-01-mao-thought-01', title: '第一章·毛泽东思想及其历史地位 单元真题训练', type: 'document' as const, status: 'done' as const },
  { id: 'maogai-practice-unit-02-new-democracy-01', title: '第二章·新民主主义革命理论 单元真题训练', type: 'document' as const, status: 'done' as const },
  { id: 'maogai-practice-unit-03-socialist-transform-01', title: '第三章·社会主义改造理论 单元真题训练', type: 'document' as const, status: 'done' as const },
  { id: 'maogai-practice-unit-04-socialist-explore-01', title: '第四章·社会主义建设道路初步探索 单元真题训练', type: 'document' as const, status: 'done' as const },
  { id: 'maogai-practice-unit-06-deng-theory-01', title: '第六章·邓小平理论 单元真题训练', type: 'document' as const, status: 'done' as const },
  { id: 'maogai-practice-unit-08-scientific-dev-01', title: '第八章·科学发展观 单元真题训练', type: 'document' as const, status: 'done' as const },
];

const probabilityKaoqianMoniItems = [
  { id: 'kaodian-01', title: '考点一·排列组合问题', type: 'document' as const, status: 'done' as const },
  { id: 'kaodian-02', title: '考点二·概率基本概念与计算', type: 'document' as const, status: 'done' as const },
  { id: 'kaodian-03', title: '考点三·贝叶斯公式', type: 'document' as const, status: 'done' as const },
  { id: 'kaodian-04', title: '考点四·随机变量及其分布', type: 'document' as const, status: 'done' as const },
  { id: 'kaodian-05', title: '考点五·离散型随机变量的分布', type: 'document' as const, status: 'done' as const },
  { id: 'kaodian-06', title: '考点六·连续型随机变量的分布', type: 'document' as const, status: 'done' as const },
  { id: 'kaodian-07', title: '考点七·随机变量函数的分布', type: 'document' as const, status: 'done' as const },
  { id: 'kaodian-08', title: '考点八·多维随机变量与条件分布', type: 'document' as const, status: 'done' as const },
  { id: 'kaodian-09', title: '考点九·随机变量的独立性', type: 'document' as const, status: 'done' as const },
  { id: 'kaodian-10', title: '考点十·多维随机变量函数的分布', type: 'document' as const, status: 'done' as const },
  { id: 'kaodian-11', title: '考点十一·期望与方差', type: 'document' as const, status: 'done' as const },
  { id: 'kaodian-12', title: '考点十二·协方差与相关系数', type: 'document' as const, status: 'done' as const },
  { id: 'kaodian-13', title: '考点十三·大数定律和中心极限定理', type: 'document' as const, status: 'done' as const },
  { id: 'kaodian-14', title: '考点十四·总体与样本', type: 'document' as const, status: 'done' as const },
  { id: 'kaodian-15', title: '考点十五·三大分布', type: 'document' as const, status: 'done' as const },
  { id: 'kaodian-16', title: '考点十六·矩估计和极大似然估计', type: 'document' as const, status: 'done' as const },
  { id: 'kaodian-17', title: '考点十七·区间估计', type: 'document' as const, status: 'done' as const },
  { id: 'kaodian-18', title: '考点十八·综合题', type: 'document' as const, status: 'done' as const },
  { id: 'exam-01', title: '2019-2020学年第二学期期末考试B卷', type: 'document' as const, status: 'done' as const },
  { id: 'exam-02', title: '2021-2022学年第一学期期末考试A卷', type: 'document' as const, status: 'done' as const },
  { id: 'exam-03', title: '2021-2022学年第二学期期末考试A卷', type: 'document' as const, status: 'done' as const },
  { id: 'exam-04', title: '2022-2023学年第一学期期末考试A卷', type: 'document' as const, status: 'done' as const },
  { id: 'exam-05', title: '2022-2023学年第二学期期末考试A卷', type: 'document' as const, status: 'done' as const },
  { id: 'exam-06', title: '2023-2024学年第一学期期末考试A卷', type: 'document' as const, status: 'done' as const },
  { id: 'mock-ai-01', title: 'AI押题模拟卷一·ChatGPT生成', type: 'document' as const, status: 'done' as const },
  { id: 'mock-ai-02', title: 'AI押题模拟卷二·Claude生成', type: 'document' as const, status: 'done' as const },
  { id: 'mock-ai-03', title: 'AI押题模拟卷三·Perplexity生成', type: 'document' as const, status: 'done' as const },
];

const probabilityShizhanYanlianItems = [
  { id: 'real-01', title: '2019-2020学年第一学期期末考试A卷', type: 'document' as const, status: 'done' as const },
  { id: 'real-02', title: '2019-2020学年第二学期期末考试A卷', type: 'document' as const, status: 'done' as const },
  { id: 'real-03', title: '2020-2021学年第二学期期末考试A卷', type: 'document' as const, status: 'done' as const },
  { id: 'real-04', title: '2021-2022学年第一学期期末考试A卷', type: 'document' as const, status: 'done' as const },
  { id: 'real-05', title: '2021-2022学年第二学期期末考试A卷', type: 'document' as const, status: 'done' as const },
  { id: 'real-06', title: '2022-2023学年第一学期期末考试A卷', type: 'document' as const, status: 'done' as const },
  { id: 'real-07', title: '2022-2023学年第二学期期末考试A卷', type: 'document' as const, status: 'done' as const },
  { id: 'real-08', title: '2023-2024学年第一学期期末考试A卷', type: 'document' as const, status: 'done' as const },
  { id: 'real-09', title: '2023-2024学年第二学期期末考试A卷', type: 'document' as const, status: 'done' as const },
  { id: 'real-10', title: '2024-2025学年第一学期期末考试A卷', type: 'document' as const, status: 'done' as const },
  { id: 'real-11', title: '2024-2025学年第二学期期末考试A卷', type: 'document' as const, status: 'done' as const },
];

const modernHistoryKaoqianMoniItems = [
  { id: 'modern-history-mock-final-paper-01', title: '纲要2026期末押题模拟试卷一（Claude生成）', type: 'document' as const, status: 'done' as const },
  { id: 'modern-history-mock-final-paper-02', title: '纲要2026期末押题模拟试卷二（Claude生成）', type: 'document' as const, status: 'done' as const },
  { id: 'modern-history-mock-final-paper-03', title: '纲要2026期末押题模拟试卷三（Claude生成）', type: 'document' as const, status: 'done' as const },
  { id: 'modern-history-mock-final-paper-04', title: '纲要2026期末押题冲刺卷一（Perplexity生成）', type: 'document' as const, status: 'done' as const },
  { id: 'modern-history-mock-final-paper-05', title: '纲要2026期末押题冲刺卷二（Perplexity生成）', type: 'document' as const, status: 'done' as const },
  { id: 'modern-history-mock-final-paper-06', title: '纲要2026期末押题冲刺卷三（Perplexity生成）', type: 'document' as const, status: 'done' as const },
];

const maogaiKaoqianMoniItems = [
  { id: 'maogai-mock-final-paper-01', title: '毛概2026期末押题模拟试卷一', type: 'document' as const, status: 'done' as const },
  { id: 'maogai-mock-final-paper-02', title: '毛概2026期末押题模拟试卷二', type: 'document' as const, status: 'done' as const },
  { id: 'maogai-mock-final-paper-03', title: '毛概2026期末押题模拟试卷三', type: 'document' as const, status: 'done' as const },
  { id: 'maogai-mock-final-paper-04', title: '毛概2026期末押题模拟卷·基础巩固（第一套）', type: 'document' as const, status: 'done' as const },
  { id: 'maogai-mock-final-paper-05', title: '毛概2026期末押题模拟卷·中等难度（第二套）', type: 'document' as const, status: 'done' as const },
  { id: 'maogai-mock-final-paper-06', title: '毛概2026期末押题模拟卷·提高冲刺（第三套）', type: 'document' as const, status: 'done' as const },
];

const baseContentTree: ContentTree = {
  subjects: [
    {
      ...subjectHeader('probability'),
      categories: [
        category('textbook', [
            { id: 'main-textbook', title: '概率论与数理统计（教材）', type: 'document', status: 'stub' },
          ]),
        category('detail', probabilityDetailItems),
        category('recording', recordingItems(probabilityLectures)),
        category('summary', summaryItems(probabilityLectures)),
        category('kaoqian-moni', probabilityKaoqianMoniItems),
        category('shizhan-yanlian', probabilityShizhanYanlianItems),
      ],
    },
    {
      ...subjectHeader('physics'),
      categories: [
        category('textbook', [stubTextbookItem('大学物理（教材）')]),
        category('detail', physicsDetailItems),
        category('recording', recordingItems(physicsLectures)),
        category('summary', summaryItems(physicsLectures)),
        category('kaoqian-moni', physicsKaoqianMoniItems),
        stubCategory('shizhan-yanlian'),
      ],
    },
    {
      ...subjectHeader('chemistry'),
      categories: [
        category('textbook', [stubTextbookItem('有机化学（教材）')]),
        category('detail', organicChemistryDetailItems),
        category('recording', recordingItems(chemistryLectures)),
        category('summary', summaryItems(chemistryLectures)),
        category('kaoqian-moni', chemistryKaoqianMoniItems),
        stubCategory('shizhan-yanlian'),
      ],
    },
    {
      ...subjectHeader('modern-history'),
      categories: [
        category('textbook', modernHistoryTextbookItems),
        category('detail', modernHistoryDetailItems),
        category('recording', recordingItems(modernHistoryLectures)),
        category('summary', summaryItems(modernHistoryLectures)),
        category('kaoqian-moni', modernHistoryKaoqianMoniItems),
        category('shizhan-yanlian', [
            { id: 'placeholder', title: '敬请期待', type: 'document' as const, status: 'stub' as const },
          ]),
      ],
    },
    {
      ...subjectHeader('maogai'),
      categories: [
        category('textbook', maogaiTextbookItems),
        category('detail', maogaiDetailItems),
        category('recording', recordingItems(maogaiLectures)),
        category('summary', summaryItems(maogaiLectures)),
        category('kaoqian-moni', maogaiKaoqianMoniItems),
        category('shizhan-yanlian', maogaiShizhanYanlianItems),
      ],
    },
    {
      ...subjectHeader('medical-english'),
      categories: sophomoreCategories({
        textbook: medicalEnglishTextbookItems,
        detail: medicalEnglishDetailItems,
        kaoqianMoni: medicalEnglishKaoqianItems,
        shizhanYanlian: medicalEnglishShizhanItems,
      }),
    },
    {
      ...subjectHeader('instrumental-analysis'),
      categories: sophomoreCategorySkeleton(instrumentalAnalysisTextbookItems),
    },
    {
      ...subjectHeader('anatomy'),
      categories: sophomoreCategories({
        textbook: anatomyTextbookItems,
        detail: anatomyDetailItems,
        kaoqianMoni: anatomyKaoqianItems,
        shizhanYanlian: anatomyShizhanItems,
      }),
    },
    {
      ...subjectHeader('medical-statistics'),
      categories: sophomoreCategories({
        textbook: medicalStatisticsTextbookItems,
        detail: medicalStatisticsDetailItems,
        kaoqianMoni: medicalStatisticsKaoqianItems,
      }),
    },
    {
      ...subjectHeader('cell-biology-lab'),
      categories: sophomoreCategorySkeleton(cellBiologyLabTextbookItems),
    },
    {
      ...subjectHeader('cell-biology'),
      categories: sophomoreCategorySkeleton(cellBiologyTextbookItems),
    },
    {
      ...subjectHeader('histology'),
      categories: sophomoreCategories({
        textbook: histologyTextbookItems,
        detail: histologyDetailItems,
        kaoqianMoni: histologyKaoqianItems,
        shizhanYanlian: histologyShizhanItems,
      }),
    },
    {
      ...subjectHeader('biochemistry'),
      categories: sophomoreCategories({
        textbook: biochemistryTextbookItems,
        detail: biochemistryDetailItems,
        summary: biochemistrySummaryItems,
        kaoqianMoni: biochemistryKaoqianItems,
        shizhanYanlian: biochemistryShizhanItems,
      }),
    },
    {
      ...subjectHeader('other'),
      // 「其他」是杂项容器，板块非标准，直接声明完整 Category（含 capabilities）。
      categories: [
        {
          id: 'english',
          name: '英语练习',
          capabilities: ['examples', 'quiz'],
          keyStrategy: 'item',
          items: [
            { id: 'unit-1', title: '大学英语 Unit 1 · The True Value of Education', type: 'document', status: 'done' },
            { id: 'unit-2', title: '大学英语 Unit 2 · The Myth of a Dream Job', type: 'document', status: 'done' },
            { id: 'unit-3', title: '大学英语 Unit 3 · The Business of Life', type: 'document', status: 'done' },
            { id: 'unit-4', title: '大学英语 Unit 4 · Explore the Unknown', type: 'document', status: 'done' },
            { id: 'unit-5', title: '大学英语 Unit 5 · The Power of Language', type: 'document', status: 'done' },
            { id: 'unit-6', title: '大学英语 Unit 6 · Technology and Human Connection', type: 'document', status: 'done' },
            { id: 'unit-7', title: '大学英语 Unit 7 · The Art of Innovation', type: 'document', status: 'done' },
            { id: 'unit-8', title: '大学英语 Unit 8 · Nature and Human Society', type: 'document', status: 'done' },
          ],
        },
        {
          id: 'misc',
          name: '工具',
          items: [
            { id: 'exam-source', title: '历届真题资源包', type: 'document', status: 'done', renderType: 'html' },
          ],
        },
        {
          id: 'gongshi',
          name: '公式',
          items: [
            { id: 'gongshi', title: '概率论公式', type: 'document', status: 'done', renderType: 'html' },
          ],
        },
        {
          id: 'guihua',
          name: '规划',
          items: [
            { id: 'schedule', title: '复习计划', type: 'document', status: 'done', renderType: 'html' },
          ],
        },
      ],
    },
  ],
};

// ── 课堂内容适配 ─────────────────────────────────────────────────────────
// 把 lectures.generated.json 中每节课的材料按板块拆分并入：
//  - recording（课上录音）：课节 navigationOnly 分组，下挂课堂原文/课堂笔记/复习手卡 3 叶子；
//  - summary（课堂纪要）：课堂纪要 minutes 叶子（full 布局，共享同一套测验）。
// 旧 rec/sum 手工条目一律保留；若某板块仅有占位 stub，则用真实课节替换占位，
// 避免「敬请期待」与真实课节并列。
function mergeLecturesIntoTree(tree: ContentTree): ContentTree {
  return {
    ...tree,
    subjects: tree.subjects.map((subject) => {
      if (!hasLectures(subject.id)) return subject;
      const recordingGroups = lectureNavGroupsBySubject(subject.id);
      const summaryLeaves = lectureSummaryLeavesBySubject(subject.id);
      const mergeInto = (cat: typeof subject.categories[number], incoming: typeof recordingGroups) => {
        const onlyStub =
          cat.items.length === 1 && cat.items[0].status === 'stub';
        const items = onlyStub ? incoming : [...cat.items, ...incoming];
        return { ...cat, items };
      };
      return {
        ...subject,
        categories: subject.categories.map((cat) => {
          if (cat.id === 'recording') return mergeInto(cat, recordingGroups);
          if (cat.id === 'summary') return mergeInto(cat, summaryLeaves);
          return cat;
        }),
      };
    }),
  };
}

export const contentTree: ContentTree = mergeLecturesIntoTree(baseContentTree);

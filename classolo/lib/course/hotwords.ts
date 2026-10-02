import type {ClassCourseProfile} from './profile'
import {classSubjectLabel} from './profile'

export const CLASS_HOTWORD_PACKS:Record<string,readonly string[]>={
  chinese:['古诗文','文言文','修辞手法','议论文','意象'],
  english:['时态','虚拟语气','从句','语音连读'],
  'medical-english':['cardiovascular','anatomy','histology','myocardium','clinical'],
  calculus:['极限','导数','定积分','微分方程','泰勒公式'],
  'linear-algebra':['矩阵','行列式','特征值','特征向量'],
  probability:['条件概率','贝叶斯公式','期望','方差','正态分布'],
  'medical-statistics':['置信区间','假设检验','生存分析','敏感度','特异度'],
  mechanics:['牛顿第二定律','动量守恒','角动量','加速度'],
  electromagnetism:['电场强度','高斯定律','磁通量','法拉第电磁感应定律'],
  optics:['折射率','全反射','光程','干涉'],circuits:['电阻','基尔霍夫定律','电容','电感'],
  'organic-chemistry':['官能团','亲核取代','手性碳','立体异构'],
  'instrumental-analysis':['色谱','质谱','吸光度','保留时间'],
  biochemistry:['三羧酸循环','氧化磷酸化','酶促反应','蛋白质折叠'],
  'cell-biology':['线粒体','内质网','细胞周期','信号转导'],
  anatomy:['解剖学','颈总动脉','股骨','肝门静脉','淋巴结'],
  histology:['上皮组织','结缔组织','组织切片','细胞外基质'],
  physiology:['心输出量','动作电位','肾小球滤过率','血氧饱和度'],
  pathology:['炎症反应','组织坏死','病理分期','病理生理'],
  pharmacology:['受体激动剂','半衰期','药代动力学','不良反应'],
  'microbiology-immunology':['抗原呈递','淋巴细胞','免疫球蛋白','细胞因子'],
  clinical:['鉴别诊断','病史采集','体格检查','临床表现'],
  history:['时间线','历史背景','史料','历史事件'],
  politics:['社会主要矛盾','实践','人民代表大会','基本路线'],
  philosophy:['认识论','辩证法','本体论'],law:['法律关系','法条','判例'],economics:['供给','需求','边际成本'],
  programming:['变量','函数','类型系统'],algorithms:['时间复杂度','动态规划','搜索算法'],
  databases:['索引','事务','关系模型'],systems:['进程','线程','内存管理'],
}
export interface ClassHotwordPlan {prompt?:string;accepted:string[];omitted:string[]}
export function planClassHotwords(profile:ClassCourseProfile):ClassHotwordPlan{
  const unique=[...new Set([...profile.customTerms,...(CLASS_HOTWORD_PACKS[profile.subdisciplineId]??[])].map(term=>term.trim()).filter(Boolean))]
  if(!unique.length)return {accepted:[],omitted:[]}
  const prefix=`本节课是${classSubjectLabel(profile)}，可能使用${profile.language==='mixed'?'中英混合':profile.language==='en'?'英语':'中文'}，专有名词：`
  const accepted:string[]=[],omitted:string[]=[]
  let length=prefix.length
  for(const term of unique){
    const next=term.length+(accepted.length?1:0)
    if(length+next<=600){accepted.push(term);length+=next}else omitted.push(term)
  }
  return {prompt:accepted.length?prefix+accepted.join('、'):undefined,accepted,omitted}
}

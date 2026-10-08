"use client";
import dynamic from 'next/dynamic';
import { PanelSkeleton } from '@/components/shared/LoadingStates';
const Classroom=dynamic(()=>import('./Workbench'),{ssr:false,loading:()=> <PanelSkeleton variant="workspace" label="正在打开课堂工作台"/>});
export default function ClassEntry(){return <Classroom/>;}

"use client";
import dynamic from 'next/dynamic';
const Classroom=dynamic(()=>import('./Workbench'),{ssr:false,loading:()=> <div className="p-8 text-sm">正在打开课堂工作台…</div>});
export default function ClassEntry(){return <Classroom/>;}

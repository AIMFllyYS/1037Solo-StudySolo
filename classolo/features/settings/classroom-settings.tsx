'use client'

import { CheckCircle2, XCircle } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/classolo/components/ui/dialog'
import type {ClassCourseProfile} from '@/classolo/lib/course/profile'
import {ClassroomCourseForm} from './classroom-course-form'

export interface ClassroomSettingsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  capabilities: { ai: boolean; asr: boolean; image: boolean } | null
  profile:ClassCourseProfile
  sessionId?:string|null
  recording:boolean
  onSaveProfile:(profile:ClassCourseProfile)=>void
}

function CapabilityRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      {ok ? (
        <CheckCircle2 className="size-4 text-[color:var(--accent)]" />
      ) : (
        <XCircle className="size-4 text-[color:var(--ink-faint)]" />
      )}
      <span className="text-[color:var(--ink)]">{label}</span>
      <span className="ml-auto text-[11px] text-[color:var(--ink-faint)]">
        {ok ? '已启用' : '未启用'}
      </span>
    </div>
  )
}

export function ClassroomSettings({
  open,
  onOpenChange,
  capabilities,
  profile,
  sessionId,
  recording,
  onSaveProfile,
}: ClassroomSettingsProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90dvh,780px)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>课堂设置</DialogTitle>
          <DialogDescription>
            AI、语音与图片能力由 1037Solo 统一账号提供并按用量计费，无需在此填写密钥。
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-[13px] font-medium text-[color:var(--ink)]">服务状态</h3>
          <div className="space-y-1.5 rounded-lg border border-[color:var(--line-soft)] bg-[color:var(--bg-app)] p-3">
            <CapabilityRow label="AI 对话与补充" ok={!!capabilities?.ai} />
            <CapabilityRow label="语音转写（ASR）" ok={!!capabilities?.asr} />
            <CapabilityRow label="课堂配图检索" ok={!!capabilities?.image} />
          </div>
        </section>

        <ClassroomCourseForm key={sessionId??'next-class'} profile={profile} recording={recording} onSave={value=>{onSaveProfile(value);onOpenChange(false)}}/>
      </DialogContent>
    </Dialog>
  )
}

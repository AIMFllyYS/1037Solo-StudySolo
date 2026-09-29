'use client'

import { useSyncExternalStore } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/classolo/components/ui/dialog'
import {
  getCustomHotwordText,
  getSelectedHotwordPackId,
  listHotwordPacks,
  parseCustomHotwordText,
  selectHotwordPack,
  setCustomHotwords,
  subscribeCustomHotwords,
  subscribeHotwordPack,
} from '@/classolo/lib/providers/asr'

export interface ClassroomSettingsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  capabilities: { ai: boolean; asr: boolean; image: boolean } | null
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
}: ClassroomSettingsProps) {
  const packId = useSyncExternalStore(
    subscribeHotwordPack,
    getSelectedHotwordPackId,
    () => 'physics',
  )
  const customText = useSyncExternalStore(
    subscribeCustomHotwords,
    getCustomHotwordText,
    () => '',
  )

  const packs = listHotwordPacks()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
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

        <section className="space-y-2">
          <h3 className="text-[13px] font-medium text-[color:var(--ink)]">热词包</h3>
          <div className="flex flex-wrap gap-2">
            {packs.map((pack) => {
              const active = pack.id === packId
              return (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => selectHotwordPack(pack.id)}
                  className={[
                    'rounded-lg border px-3 py-1.5 text-[13px]',
                    active
                      ? 'border-[color:var(--accent)] bg-[color:var(--accent-weak)] text-[color:var(--accent-ink)]'
                      : 'border-[color:var(--line-soft)] text-[color:var(--ink-soft)] hover:bg-[color:var(--bg-muted)]',
                  ].join(' ')}
                >
                  {pack.label}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-[color:var(--ink-faint)]">
            热词包提升该学科专有名词的识别准确率。
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-[13px] font-medium text-[color:var(--ink)]">自定义热词</h3>
          <textarea
            key={open ? 'open' : 'closed'}
            defaultValue={customText}
            onBlur={(e) => setCustomHotwords(parseCustomHotwordText(e.target.value))}
            placeholder="每行一个，或用逗号/分号分隔"
            aria-label="自定义热词"
            className="h-24 w-full rounded-lg border border-[color:var(--line-soft)] bg-[color:var(--bg-app)] p-2.5 text-[13px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--ink-faint)]"
          />
          <p className="text-[11px] text-[color:var(--ink-faint)]">
            自定义热词会与所选热词包合并，下次录音生效。
          </p>
        </section>
      </DialogContent>
    </Dialog>
  )
}

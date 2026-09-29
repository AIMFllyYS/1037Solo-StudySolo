'use client'

import { useState, useSyncExternalStore } from 'react'

import { Button } from '@/classolo/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/classolo/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/classolo/components/ui/select'
import {
  DEFAULT_HOTWORD_PACK_ID,
  getCustomHotwordText,
  getSelectedHotwordPackId,
  listHotwordPacks,
  subscribeCustomHotwords,
  subscribeHotwordPack,
} from '@/classolo/lib/providers/asr'
import { useSettingsPublic, useTranscriptPublic } from '@/classolo/lib/session'
import { cn } from '@/classolo/lib/utils'

import { saveHotwordSettings } from './hotwords-save'

export function HotwordsSettingsForm() {
  const packs = listHotwordPacks()
  const storedPackId = useSyncExternalStore(
    subscribeHotwordPack,
    getSelectedHotwordPackId,
    () => DEFAULT_HOTWORD_PACK_ID,
  )
  const storedCustomText = useSyncExternalStore(
    subscribeCustomHotwords,
    getCustomHotwordText,
    () => '',
  )
  const [draftPackId, setDraftPackId] = useState<string | null>(null)
  const [draftCustomText, setDraftCustomText] = useState<string | null>(null)
  const packId = draftPackId ?? storedPackId
  const customText = draftCustomText ?? storedCustomText
  const [result, setResult] = useState('')
  const version = useSettingsPublic((state) => state.hotwordsVersion)
  const recording = useTranscriptPublic((state) => state.recordingStatus)

  return (
    <Card>
      <CardHeader>
        <CardTitle>热词</CardTitle>
        <CardDescription>
          自定义热词叠加在学科预置包之上，保存后下次录音生效。尚未建表前写入本地偏好，不进
          PGlite。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            const saved = saveHotwordSettings({ packId, customText })
            setDraftPackId(null)
            setDraftCustomText(null)
            setResult(saved.message)
          }}
        >
          <label className="flex flex-col gap-2 text-sm text-foreground">
            学科预置包
            <Select value={packId} onValueChange={setDraftPackId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择热词包" />
              </SelectTrigger>
              <SelectContent>
                {packs.map((pack) => (
                  <SelectItem key={pack.id} value={pack.id}>
                    {pack.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-foreground">
            自定义热词（每行一个，可与逗号混用）
            <textarea
              value={customText}
              onChange={(event) => setDraftCustomText(event.target.value)}
              rows={6}
              placeholder="法拉第电磁感应定律"
              className={cn(
                'min-h-32 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
                'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
              )}
            />
          </label>
          {recording === 'recording' ? (
            <p className="text-sm text-muted-foreground">
              正在录音：保存后下次录音生效（P0 不做热切）。
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit">保存热词</Button>
            <p className="text-sm text-muted-foreground">版本 {version}</p>
          </div>
          {result ? (
            <p
              className="text-sm text-foreground"
              data-slot="hotwords-save-result"
            >
              {result}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  )
}

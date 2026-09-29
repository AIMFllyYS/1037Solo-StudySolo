'use client'

import { useState } from 'react'

import { Button } from '@/classolo/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/classolo/components/ui/card'
import { Input } from '@/classolo/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/classolo/components/ui/select'
import { useSettingsPublic, useTranscriptPublic } from '@/classolo/lib/session'

import {
  ASR_DIALECTS,
  ASR_FAMILIES,
  isSettingsAsrFamily,
  type SettingsAsrFamily,
} from './asr-config'
import { getAsrPrivateConfig } from './asr-private-store'
import { saveAsrSettings } from './asr-save'

function readEnvDefault(name: string): string {
  if (typeof process === 'undefined' || !process.env) return ''
  const publicValue = process.env[`NEXT_PUBLIC_${name}`]
  const value = process.env[name]
  const picked = publicValue ?? value ?? ''
  return typeof picked === 'string' ? picked.trim() : ''
}

export function AsrSettingsForm() {
  const stored = getAsrPrivateConfig()
  const initialFamily = isSettingsAsrFamily(stored.family)
    ? stored.family
    : isSettingsAsrFamily(readEnvDefault('ASR_FAMILY'))
      ? (readEnvDefault('ASR_FAMILY') as SettingsAsrFamily)
      : 'realtime-ws'
  const [family, setFamily] = useState<SettingsAsrFamily>(initialFamily)
  const dialectOptions = ASR_DIALECTS[family]
  const [dialect, setDialect] = useState(
    stored.dialect || readEnvDefault('ASR_DIALECT') || dialectOptions[0] || '',
  )
  const [baseUrl, setBaseUrl] = useState(
    stored.baseUrl || readEnvDefault('ASR_BASE_URL'),
  )
  const [model, setModel] = useState(
    stored.model || readEnvDefault('ASR_MODEL'),
  )
  const [sampleRate, setSampleRate] = useState(
    stored.sampleRate || readEnvDefault('ASR_SAMPLE_RATE') || '16000',
  )
  const [apiKey, setApiKey] = useState(stored.apiKey)
  const [result, setResult] = useState('')
  const version = useSettingsPublic((state) => state.asrConfigVersion)
  const ready = useSettingsPublic((state) => state.asrReady)
  const recording = useTranscriptPublic((state) => state.recordingStatus)

  return (
    <Card>
      <CardHeader>
        <CardTitle>ASR 协议族</CardTitle>
        <CardDescription>
          族与 dialect 必须显式选择，禁止从 baseURL 推断（ADR-0004）。
          transcriptions-rest 为切片伪流式，文稿区会标注「准实时」。密钥写入
          sessionStorage 覆盖层，不进 PGlite。录音中更改只在下次录音生效。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            const saved = saveAsrSettings({
              family,
              dialect,
              baseUrl,
              apiKey,
              model,
              sampleRate,
            })
            setResult(saved.message)
          }}
        >
          <label className="flex flex-col gap-2 text-sm text-foreground">
            协议族
            <Select
              value={family}
              onValueChange={(value) => {
                if (!isSettingsAsrFamily(value)) return
                setFamily(value)
                const nextDialect = ASR_DIALECTS[value][0] ?? ''
                setDialect(nextDialect)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="显式选择协议族" />
              </SelectTrigger>
              <SelectContent>
                {ASR_FAMILIES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-foreground">
            dialect
            <Select value={dialect} onValueChange={setDialect}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="显式选择 dialect" />
              </SelectTrigger>
              <SelectContent>
                {dialectOptions.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-foreground">
            Base URL
            <Input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="wss://api.stepfun.com/v1/realtime/asr/stream"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-foreground">
            模型
            <Input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="stepaudio-2.5-asr-stream"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-foreground">
            采样率
            <Input
              value={sampleRate}
              onChange={(event) => setSampleRate(event.target.value)}
              placeholder="16000"
              inputMode="numeric"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-foreground">
            API key（用户覆盖）
            <Input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="留空则使用运行时 env"
              autoComplete="off"
            />
          </label>
          {recording === 'recording' ? (
            <p className="text-sm text-muted-foreground">
              正在录音：保存后下次录音生效（P0 不做热切）。
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit">保存 ASR 配置</Button>
            <p className="text-sm text-muted-foreground">
              版本 {version} · {ready ? '已就绪' : '未就绪'}
            </p>
          </div>
          {result ? (
            <p className="text-sm text-foreground" data-slot="asr-save-result">
              {result}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  )
}

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
import { useSettingsPublic } from '@/classolo/lib/session'

import { saveAiSettings } from './ai-save'
import { getAiPrivateConfig } from './private-store'

function readEnvDefault(name: string): string {
  if (typeof process === 'undefined' || !process.env) return ''
  const publicValue = process.env[`NEXT_PUBLIC_${name}`]
  const value = process.env[name]
  const picked = publicValue ?? value ?? ''
  return typeof picked === 'string' ? picked.trim() : ''
}

export function AiSettingsForm() {
  const stored = getAiPrivateConfig()
  const [baseUrl, setBaseUrl] = useState(
    stored.baseUrl || readEnvDefault('AI_BASE_URL'),
  )
  const [model, setModel] = useState(
    stored.model || readEnvDefault('AI_MODEL'),
  )
  const [apiKey, setApiKey] = useState(stored.apiKey)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string>('')
  const ready = useSettingsPublic((state) => state.aiReady)
  const version = useSettingsPublic((state) => state.aiConfigVersion)

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI 协议族</CardTitle>
        <CardDescription>
          OpenAI 兼容 Chat Completions。用户填写的 key 优先于运行时 env（ADR-0013）。开发期覆盖写入 sessionStorage（不加密），不进 PGlite；桌面期将改走 Electron safeStorage。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            setBusy(true)
            void saveAiSettings({ baseUrl, model, apiKey }).then((ping) => {
              setResult(ping.message)
              setBusy(false)
            })
          }}
        >
          <label className="flex flex-col gap-2 text-sm text-foreground">
            Base URL
            <Input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.openai.com/v1"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-foreground">
            模型
            <Input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="z-ai/glm-5.3-flash"
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
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? '正在校验…' : '保存并校验连通'}
            </Button>
            <p className="text-sm text-muted-foreground">
              版本 {version} · {ready ? '已连通' : '未连通'}
            </p>
          </div>
          {result ? (
            <p
              className={
                ready ? 'text-sm text-foreground' : 'text-sm text-destructive'
              }
              data-slot="ai-ping-result"
            >
              {result}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  )
}

'use client'

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/classolo/components/ui/tabs'

import { AiSettingsForm } from './ai-form'
import { AsrSettingsForm } from './asr-form'
import { HotwordsSettingsForm } from './hotwords-form'
import { ThemeSettingsForm } from './theme-form'

export function SettingsScreen() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <Tabs defaultValue="ai" className="gap-0">
        <div className="border-b border-border px-4 py-3">
          <TabsList className="w-full">
            <TabsTrigger value="ai">AI</TabsTrigger>
            <TabsTrigger value="asr">ASR</TabsTrigger>
            <TabsTrigger value="hotwords">热词</TabsTrigger>
            <TabsTrigger value="theme">主题</TabsTrigger>
          </TabsList>
        </div>
        <div className="px-6 py-5">
          <TabsContent value="ai">
            <AiSettingsForm />
          </TabsContent>
          <TabsContent value="asr">
            <AsrSettingsForm />
          </TabsContent>
          <TabsContent value="hotwords">
            <HotwordsSettingsForm />
          </TabsContent>
          <TabsContent value="theme">
            <ThemeSettingsForm />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

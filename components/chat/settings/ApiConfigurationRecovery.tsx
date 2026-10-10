'use client';

import { useRef, useState } from 'react';
import { useSettings } from '@/lib/stores/settings';
import { backupSettings, decodeApiBackup, encodeApiBackup, readSettingsBackup } from '@/lib/stores/settingsRecovery';
import { splitSettingsSecrets } from '@/lib/stores/apiSecrets';
import { useT } from '@/lib/i18n';

export function ApiConfigurationRecovery() {
  const groups = useSettings((s) => s.customApiGroups);
  const warning = useSettings((s) => s.settingsLoadWarning);
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const t = useT();
  const importText = (raw: string) => {
    const data = decodeApiBackup(raw);
    useSettings.getState().importApiConfiguration(data.groups, data.selectedModelId);
    setMessage(t('settings.apiRecovery.merged', { count: data.groups.length }));
  };
  const button = 'rounded-md border border-[var(--line)] px-2 py-1.5 text-[11px] text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]';
  return <div className="space-y-2">
    {warning ? <p role="alert" className="text-[11px] text-[var(--md-sys-color-error)]">{warning}</p> : null}
    {!groups.length ? <p className="text-[11px] leading-relaxed text-[var(--ink-faint)]">{t('settings.apiRecovery.noGroups')}</p> : null}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} onClick={() => fileRef.current?.click()}>{t('settings.apiRecovery.import')}</button>
      <button type="button" disabled={!groups.length} className={button + ' disabled:opacity-40'} onClick={() => {
        backupSettings(localStorage);
        const data = encodeApiBackup(groups, useSettings.getState().selectedModelId);
        const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'studyreview-api-backup.json'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage(t('settings.apiRecovery.exported'));
      }}>{t('settings.apiRecovery.export')}</button>
      <button type="button" className={button} onClick={() => {
        const backup = readSettingsBackup(localStorage);
        if (!backup) { setMessage(t('settings.apiRecovery.noBackup')); return; }
        try {
          const data = decodeApiBackup(backup.settings);
          const split = splitSettingsSecrets(data.groups, backup.secrets);
          useSettings.getState().importApiConfiguration(split.groupsForMemory, data.selectedModelId);
          setMessage(t('settings.apiRecovery.restored'));
        } catch { setMessage(t('settings.apiRecovery.unreadable')); }
      }}>{t('settings.apiRecovery.restore')}</button>
    </div>
    <p className="text-[10px] leading-relaxed text-[var(--ink-faint)]">{t('settings.apiRecovery.exportHint')}</p>
    <input ref={fileRef} type="file" accept="application/json,.json" aria-label={t('settings.apiRecovery.importAria')} className="hidden" onChange={async (event) => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
      try { if (file.size > 2_000_000) throw new Error(t('settings.apiRecovery.tooLarge')); importText(await file.text()); }
      catch (error) { setMessage(error instanceof Error ? error.message : t('settings.apiRecovery.importFailed')); }
    }} />
    {message ? <p role="status" className="text-[11px] text-[var(--ink-soft)]">{message}</p> : null}
  </div>;
}

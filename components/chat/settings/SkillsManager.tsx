'use client';

import { useRef, useState } from 'react';
import { Upload, Trash2, FileText, Pin } from 'lucide-react';
import { useSkills, MAX_SKILLS } from '@/lib/stores/skills';
import { useHydrated } from '@/lib/hooks/runtime/useHydrated';
import { importSkillFiles } from '@/lib/utils/importSkills';
import { useT } from '@/lib/i18n/index';

function fmtSize(content: string): string {
  const bytes = new Blob([content]).size;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** 小开关（与 ChatSettings 内 Toggle 同款，独立复制以避免跨组件耦合）。 */
function Toggle({ on, onClick, title }: { on: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="relative h-[22px] w-[40px] shrink-0 rounded-full transition-colors"
      style={{ background: on ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-surface-container-highest)' }}
    >
      <span
        className="absolute top-[3px] h-4 w-4 rounded-full transition-[left]"
        style={{ left: on ? 21 : 3, background: 'var(--md-sys-color-on-primary)', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }}
      />
    </button>
  );
}

/** 技能库管理表格（落 useSkills / IndexedDB）。支持 .md / ZIP / .skill，最多 MAX_SKILLS 个。 */
export default function SkillsManager() {
  const hydrated = useHydrated(useSkills);
  const skills = useSkills((s) => s.skills);
  const addSkill = useSkills((s) => s.addSkill);
  const updateSkill = useSkills((s) => s.updateSkill);
  const deleteSkill = useSkills((s) => s.deleteSkill);
  const togglePin = useSkills((s) => s.togglePin);

  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState('');
  const t = useT();

  const atLimit = skills.length >= MAX_SKILLS;

  const input =
    'w-full rounded-md border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] px-2 py-1 text-[12.5px] text-[var(--md-sys-color-on-surface)] outline-none focus:border-[var(--md-sys-color-primary)]';

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setErr('');
    const imported = await importSkillFiles(files);
    let added = 0;
    for (const parsed of imported.skills) {
      const ok = addSkill({ name: parsed.name, description: parsed.description, content: parsed.content });
      if (!ok) {
        setErr(t('settings.skills.maxReached', { max: MAX_SKILLS }));
        break;
      }
      added += 1;
    }
    const messages = [...imported.errors];
    if (imported.rejected > 0 && added === 0 && imported.skills.length === 0) {
      messages.push(t('settings.skills.unsupported'));
    }
    if (messages.length) setErr((p) => p || messages[0] || '');
    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={fileRef}
        type="file"
        accept=".md,.markdown,.zip,.skill,text/markdown,application/zip"
        multiple
        onChange={handleFiles}
        className="hidden"
      />

      <div className="flex items-center gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={atLimit}
          className="press flex items-center gap-1.5 rounded-lg bg-[var(--md-sys-color-primary)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--md-sys-color-on-primary)] disabled:opacity-40"
        >
          <Upload size={14} /> {t('settings.skills.import')}
        </button>
        <span className="text-[11.5px] text-[var(--md-sys-color-on-surface-variant)]">
          {skills.length} / {MAX_SKILLS} · .md / ZIP / .skill
        </span>
      </div>

      {err && <div className="text-[11.5px] text-[var(--md-sys-color-error)]">{err}</div>}

      {!hydrated ? (
        <div className="text-[11.5px] text-[var(--md-sys-color-on-surface-variant)]">{t('settings.skills.loading')}</div>
      ) : skills.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--md-sys-color-outline-variant)] px-3 py-4 text-center text-[11.5px] text-[var(--md-sys-color-on-surface-variant)]">
          {t('settings.skills.empty')}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {skills.map((sk) => (
            <div
              key={sk.id}
              className="flex flex-col gap-1.5 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-2.5 py-2"
            >
              <div className="flex items-center gap-2">
                <FileText size={14} className="shrink-0 text-[var(--md-sys-color-primary)]" />
                <input
                  value={sk.name}
                  onChange={(e) => updateSkill(sk.id, { name: e.target.value })}
                  placeholder={t('settings.skills.name')}
                  className={input + ' font-medium'}
                />
                <span className="shrink-0 text-[10.5px] text-[var(--md-sys-color-on-surface-variant)]">
                  {fmtSize(sk.content)}
                </span>
                <span title={t(sk.pinned ? 'settings.skills.pinTitle' : 'settings.skills.unpinTitle')}>
                  <Toggle on={sk.pinned} onClick={() => togglePin(sk.id)} />
                </span>
                <button
                  onClick={() => deleteSkill(sk.id)}
                  title={t('settings.skills.remove')}
                  className="shrink-0 rounded p-1 text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--md-sys-color-error)]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <input
                value={sk.description}
                onChange={(e) => updateSkill(sk.id, { description: e.target.value })}
                placeholder={t('settings.skills.description')}
                className={input}
              />
              {sk.pinned && (
                <div className="flex items-center gap-1 text-[10.5px] text-[var(--md-sys-color-primary)]">
                  <Pin size={10} style={{ transform: 'rotate(-45deg)' }} /> {t('settings.skills.pinnedNote')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

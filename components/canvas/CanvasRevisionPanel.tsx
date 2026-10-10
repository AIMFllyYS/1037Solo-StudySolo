import { useState } from 'react';
import { useSettings } from '@/lib/stores/settings';
import { selectCustomApiGroupsForRequest } from '@/lib/ai/models';
import type { CanvasBlock } from '@/lib/canvas/types';

interface CanvasRevisionPanelProps {
  block?: CanvasBlock;
  topic?: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit?: (instruction: string) => void | Promise<void>;
  onRevisionAccepted?: (block: CanvasBlock) => void;
}

export function CanvasRevisionPanel({
  block,
  topic,
  busy = false,
  error,
  onCancel,
  onSubmit,
  onRevisionAccepted,
}: CanvasRevisionPanelProps) {
  const [instruction, setInstruction] = useState('');
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const effectiveBusy = busy || localBusy;
  const effectiveError = error ?? localError;

  const submit = async () => {
    const value = instruction.trim();
    if (!value || effectiveBusy) return;

    if (onSubmit) {
      await onSubmit(value);
      return;
    }

    if (!block) {
      setLocalError('Missing current canvas block.');
      return;
    }

    setLocalBusy(true);
    setLocalError(null);
    try {
      const settings = useSettings.getState();
      const res = await fetch('/api/canvas-revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          block,
          instruction: value,
          topic,
          modelId: settings.selectedModelId,
          customApiGroups: selectCustomApiGroupsForRequest(
            settings.customApiGroups,
            settings.selectedModelId,
          ),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.block) {
        const message = typeof payload?.error === 'string' ? payload.error : 'Canvas revision failed.';
        setLocalError(message);
        return;
      }
      onRevisionAccepted?.(payload.block as CanvasBlock);
      setInstruction('');
      onCancel();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Canvas revision request failed.');
    } finally {
      setLocalBusy(false);
    }
  };

  return (
    <div className="canvas-revision-panel">
      <textarea
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        placeholder="Describe how to update this canvas"
        rows={3}
      />
      {effectiveError ? <div className="canvas-revision-error">{effectiveError}</div> : null}
      <div className="canvas-revision-actions">
        <button type="button" className="press" onClick={onCancel} disabled={effectiveBusy}>
          Cancel
        </button>
        <button type="button" className="press canvas-revision-submit" onClick={submit} disabled={effectiveBusy || !instruction.trim()}>
          {effectiveBusy ? 'Updating...' : 'Update canvas'}
        </button>
      </div>
    </div>
  );
}


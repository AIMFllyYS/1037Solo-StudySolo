import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ApiConfigurationRecovery } from './ApiConfigurationRecovery';
import ModelMenu from '../composer/ModelMenu';
import { useSettings } from '@/lib/hooks/useSettings';
import { encodeApiBackup } from '@/lib/stores/settingsRecovery';
import { SETTINGS_LS_KEY } from '@/lib/stores/apiSecrets';

const original = useSettings.getState();
afterEach(() => { cleanup(); useSettings.setState(original); localStorage.clear(); });
it('a recovered API file flows through the real store, menu group, model selector and safe persistence', async () => {
  useSettings.setState({ customApiGroups: [], selectedModelId: 'auto', settingsLoadWarning: null });
  const raw = encodeApiBackup([{ id: 'restored', name: '旧设备 API', baseUrl: 'https://example.invalid/v1', apiKey: 'test-key-private', models: [{ id: 'custom-model', label: '原来的模型' }] }], 'custom:restored:custom-model');
  const file = new File([raw], 'backup.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => raw });
  render(<><ApiConfigurationRecovery /><ModelMenu /></>);
  fireEvent.change(screen.getByLabelText('导入 API 配置文件'), { target: { files: [file] } });
  await waitFor(() => expect(useSettings.getState().customApiGroups).toHaveLength(1));
  expect(useSettings.getState().selectedModelId).toBe('custom:restored:custom-model');
  expect(localStorage.getItem(SETTINGS_LS_KEY)).not.toContain('test-key-private');
  fireEvent.click(screen.getByTestId('model-menu-button'));
  fireEvent.click(screen.getByRole('button', { name: '旧设备 API' }));
  expect(screen.getByTestId('model-menu-item-custom:restored:custom-model')).toBeTruthy();
});

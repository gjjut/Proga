// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createEmptyData } from '../shared/model';

vi.mock('../src/lib/api', () => ({
  isDesktop: true,
  api: {
    load: vi.fn().mockResolvedValue(createEmptyData()),
    info: vi.fn().mockResolvedValue({ recoveryWarning: 'Восстановлено из копии; проверьте последние изменения' }),
  },
}));
import App from '../src/App';
import { AppProvider } from '../src/state';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('предупреждает при восстановлении из резервной копии', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(<AppProvider><App /></AppProvider>); });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Восстановлено из копии');
  expect(container.querySelector('.app-shell')).not.toBeNull();
  await act(async () => root.unmount());
  container.remove();
});

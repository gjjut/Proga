// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import App from '../src/App';
import { AppProvider } from '../src/state';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

it('показывает постоянную ошибку загрузки и не заменяет повреждённые данные демо-данными', async () => {
  const key = 'zaton-finance:data:v1';
  localStorage.setItem(key, '{broken');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(<AppProvider><App /></AppProvider>); });
  expect(container.textContent).toContain('Не удалось загрузить данные');
  expect(container.textContent).toContain('Работа с данными остановлена');
  expect(container.querySelector('.app-shell')).toBeNull();
  expect(localStorage.getItem(key)).toBe('{broken');
  await act(async () => root.unmount());
  container.remove();
});

it('не сообщает об успешном сохранении, когда браузер отказал в записи', async () => {
  const { api } = await import('../src/lib/api');
  localStorage.setItem('zaton-finance:data:v1', JSON.stringify({ records: [], adjustments: [] }));
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await expect(api.updateSettings({ commissionRate: 5 })).rejects.toThrow('Не удалось сохранить');
});

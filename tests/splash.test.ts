import { describe, expect, it } from 'vitest';
import { renderSplashHtml } from '../electron/splash';

describe('заставка', () => {
  it('собирает самостоятельный HTML без внешних ресурсов', () => {
    const html = renderSplashHtml('1.2.0');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Финансы</title>');
    // Никаких ссылок на файлы: заставка грузится из data-URL и живёт в одном окне.
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/url\((?!['"]?data:)/i);
  });

  it('начинает с крутящегося круга и показывает версию', () => {
    const html = renderSplashHtml('1.2.0');
    expect(html).toContain('<body data-stage="ring">');
    expect(html).toContain('v1.2.0');
    expect(html).toContain('Загружаем данные…');
    // Фаза 1 — индикатор, фаза 2 — карточка заставки.
    expect(html).toContain('class="spinner"');
    expect(html).toContain('data-stage=\'card\'');
  });

  it('умеет фиксировать фазу для скриншотов', () => {
    const ring = renderSplashHtml('1.2.0', { frozenStage: 'ring' });
    const card = renderSplashHtml('1.2.0', { frozenStage: 'card' });
    expect(ring).toContain('<body data-stage="ring">');
    expect(card).toContain('<body data-stage="card">');
    // В замороженном режиме таймер перехода не запускается.
    expect(card).toContain('var FROZEN = true;');
    expect(renderSplashHtml('1.2.0')).toContain('var FROZEN = false;');
  });

  it('экранирует версию, чтобы её нельзя было вставить как разметку', () => {
    const html = renderSplashHtml('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&#60;img');
  });
});

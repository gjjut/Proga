/**
 * Стартовая заставка приложения.
 *
 * Живёт в отдельном прозрачном окне без рамки: сначала это маленький белый круг
 * с чёрным вращающимся индикатором, потом круг разворачивается в белую карточку
 * с логотипом, названием, версией и полосой загрузки. Когда интерфейс готов,
 * main вызывает `window.splashReady()` — карточка плавно гаснет, окно закрывается,
 * и только после этого показывается главное окно программы.
 *
 * HTML собирается строкой: так заставке не нужны ни отдельные файлы в сборке,
 * ни дополнительная возня с путями внутри asar.
 */

export type SplashStage = 'ring' | 'card';

export interface SplashOptions {
  /** Зафиксировать фазу (нужно для скриншотов документации). */
  frozenStage?: SplashStage;
}

function encodeVersion(version: string): string {
  return version.replace(/[<>&"]/g, (char) => `&#${char.charCodeAt(0)};`);
}

export function renderSplashHtml(version: string, options: SplashOptions = {}): string {
  const frozen = options.frozenStage ? 'true' : 'false';
  const initialStage = options.frozenStage ?? 'ring';
  const safeVersion = encodeVersion(version);

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>Финансы</title>
<style>
  :root {
    --ink: #0f1419;
    --paper: #ffffff;
    --muted: #6a7178;
    --faint: #9aa1a8;
    --line: rgba(15, 20, 25, 0.09);
  }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    height: 100%;
    background: transparent;
    overflow: hidden;
  }

  body {
    display: grid;
    place-items: center;
    font-family: 'Segoe UI', 'Inter', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    user-select: none;
    cursor: default;
  }

  /* ── карточка: сначала круг, потом панель заставки ── */
  .card {
    position: relative;
    display: grid;
    place-items: center;
    width: 116px;
    height: 116px;
    border-radius: 58px;
    background: var(--paper);
    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.45);
    overflow: hidden;
    transform: scale(0.92);
    opacity: 0;
    animation: appear 0.42s cubic-bezier(0.22, 0.9, 0.24, 1) forwards;
    transition:
      width 0.58s cubic-bezier(0.22, 0.9, 0.24, 1),
      height 0.58s cubic-bezier(0.22, 0.9, 0.24, 1),
      border-radius 0.58s cubic-bezier(0.22, 0.9, 0.24, 1),
      opacity 0.26s ease,
      transform 0.32s ease;
  }

  body[data-stage='card'] .card,
  body[data-stage='done'] .card {
    width: 460px;
    height: 300px;
    border-radius: 28px;
  }

  body[data-stage='done'] .card {
    opacity: 0;
    transform: scale(0.965);
  }

  /* ── фаза 1: чёрный индикатор на белом ── */
  .spinner {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 3px solid rgba(15, 20, 25, 0.12);
    border-top-color: var(--ink);
    animation: spin 0.85s linear infinite;
    transition: opacity 0.2s ease, transform 0.2s ease;
  }

  body[data-stage='card'] .spinner,
  body[data-stage='done'] .spinner {
    opacity: 0;
    transform: scale(0.55);
  }

  /* ── фаза 2: заставка ── */
  .content {
    position: absolute;
    inset: 0;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 9px;
    padding-bottom: 6px;
    opacity: 0;
    transform: translateY(7px);
    transition: opacity 0.32s ease, transform 0.36s cubic-bezier(0.22, 0.9, 0.24, 1);
    pointer-events: none;
  }

  body[data-stage='card'] .content {
    opacity: 1;
    transform: none;
    transition-delay: 0.16s;
  }

  body[data-stage='done'] .content {
    opacity: 0;
    transition-delay: 0s;
    transition-duration: 0.18s;
  }

  .mark {
    width: 46px;
    height: 46px;
    border-radius: 13.5px;
    background: var(--ink);
    display: grid;
    place-items: center;
    margin-bottom: 6px;
  }

  .mark svg { display: block; }

  .title {
    font-size: 27px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--ink);
    line-height: 1;
  }

  .subtitle {
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.01em;
    color: var(--muted);
  }

  .progress {
    position: relative;
    width: 148px;
    height: 3px;
    margin-top: 16px;
    border-radius: 999px;
    background: var(--line);
    overflow: hidden;
  }

  .progress i {
    position: absolute;
    top: 0;
    left: 0;
    width: 44%;
    height: 100%;
    border-radius: 999px;
    background: var(--ink);
    animation: slide 1.35s cubic-bezier(0.55, 0.15, 0.45, 0.85) infinite;
  }

  .status {
    margin-top: 2px;
    font-size: 11.5px;
    color: var(--muted);
  }

  .version {
    position: absolute;
    bottom: 14px;
    opacity: 0;
    transition: opacity 0.3s ease;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 10.5px;
    letter-spacing: 0.04em;
    color: var(--faint);
  }

  body[data-stage='card'] .version {
    opacity: 1;
    transition-delay: 0.24s;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @keyframes appear {
    to { opacity: 1; transform: scale(1); }
  }

  @keyframes slide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(240%); }
  }

  @media (prefers-reduced-motion: reduce) {
    .card { animation-duration: 0.01s; transition-duration: 0.01s; }
    .spinner { animation-duration: 2.6s; }
    .progress i { animation-duration: 3.2s; }
  }
</style>
</head>
<body data-stage="${initialStage}">
  <div class="card">
    <div class="spinner" aria-hidden="true"></div>
    <div class="content">
      <div class="mark" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 32 32" focusable="false">
          <path
            d="M9.5 22V17.2M16 22V13M22.5 22V9.6"
            stroke="#ffffff"
            stroke-width="3"
            stroke-linecap="round"
            fill="none"
          />
        </svg>
      </div>
      <div class="title">Финансы</div>
      <div class="subtitle">две компании</div>
      <div class="progress" aria-hidden="true"><i></i></div>
      <div class="status">Загружаем данные…</div>
    </div>
    <div class="version">v${safeVersion}</div>
  </div>

  <script>
    (function () {
      var FROZEN = ${frozen};
      var body = document.body;

      // Фаза 1 → фаза 2: круг разворачивается в карточку заставки.
      if (!FROZEN) {
        setTimeout(function () {
          body.dataset.stage = 'card';
        }, 820);
      }

      // Вызывается из main, когда интерфейс готов: карточка гаснет.
      window.splashReady = function () {
        body.dataset.stage = 'done';
      };
    })();
  </script>
</body>
</html>`;
}

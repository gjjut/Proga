/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface Window {
  finance?: import('../shared/api').FinanceApi;
}

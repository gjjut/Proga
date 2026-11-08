import { useMemo } from 'react';
import { BrandMark } from './components/Icons';
import { Sidebar } from './components/Sidebar';
import { Toasts } from './components/Toasts';
import { Adjustments } from './screens/Adjustments';
import { Dashboard } from './screens/Dashboard';
import { DayEntry } from './screens/DayEntry';
import { History } from './screens/History';
import { Settings } from './screens/Settings';
import { useApp } from './state';

export default function App() {
  const { ready, loadError, info, isDesktop, screen, dayTarget, openDataFolder } = useApp();

  const content = useMemo(() => {
    switch (screen) {
      case 'day':
        return (
          <DayEntry
            key={`${dayTarget?.company ?? 'any'}-${dayTarget?.date ?? 'today'}`}
          />
        );
      case 'adjustments':
        return <Adjustments />;
      case 'history':
        return <History />;
      case 'settings':
        return <Settings />;
      case 'dashboard':
      default:
        return <Dashboard />;
    }
  }, [screen, dayTarget]);

  if (!ready) {
    return (
      <div className="splash">
        <BrandMark size={54} />
        <div className="splash__spinner" />
        <p className="splash__text">Загружаем финансовые данные…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="splash" role="alert">
        <h2>Не удалось загрузить данные</h2>
        <p className="splash__text">{loadError}</p>
        <p className="splash__text">Работа с данными остановлена. Не удаляйте файлы; проверьте резервную копию и перезапустите программу.</p>
        {isDesktop && <button className="btn" onClick={() => void openDataFolder()}>Открыть папку данных</button>}
        <Toasts />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        {info?.recoveryWarning && <div className="recovery-warning" role="alert">{info.recoveryWarning}</div>}
        {info?.autoBackupWarning && <div className="recovery-warning" role="alert">{info.autoBackupWarning}</div>}
        {content}
      </main>
      <Toasts />
    </div>
  );
}

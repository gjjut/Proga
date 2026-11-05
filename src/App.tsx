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
  const { ready, screen, dayTarget } = useApp();

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

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">{content}</main>
      <Toasts />
    </div>
  );
}

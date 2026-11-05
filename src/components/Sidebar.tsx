import type { ComponentType } from 'react';
import { useApp, type ScreenId } from '../state';
import {
  BrandMark,
  ClockIcon,
  HomeIcon,
  MoonIcon,
  PenIcon,
  SettingsIcon,
  SunIcon,
  type IconProps,
} from './Icons';

interface NavItem {
  id: ScreenId;
  label: string;
  icon: ComponentType<IconProps>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Главное', icon: HomeIcon },
  { id: 'day', label: 'Запись дня', icon: PenIcon },
  { id: 'history', label: 'История', icon: ClockIcon },
  { id: 'settings', label: 'Настройки', icon: SettingsIcon },
];

export function Sidebar() {
  const { screen, navigate, data, updateSettings, info, isDesktop } = useApp();
  const theme = data.settings.theme;
  const version = info?.version ?? __APP_VERSION__;

  return (
    <aside className="sidebar">
      <button type="button" className="sidebar__brand" onClick={() => navigate('dashboard')}>
        <BrandMark size={36} />
        <span className="sidebar__brand-text">
          <strong>Финансы</strong>
          <small>две компании</small>
        </span>
      </button>

      <nav className="nav" aria-label="Основная навигация">
        {NAV_ITEMS.map((item) => {
          const active = screen === item.id;
          const IconComponent = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={`nav__item${active ? ' is-active' : ''}`}
              onClick={() => navigate(item.id)}
              aria-current={active ? 'page' : undefined}
              title={item.label}
            >
              <span className="nav__icon">
                <IconComponent size={22} />
              </span>
              <span className="nav__label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar__spacer" />

      <button type="button" className="btn btn--primary sidebar__cta" onClick={() => navigate('day')}>
        <PenIcon size={18} />
        <span>Записать день</span>
      </button>

      <div className="sidebar__footer">
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={() => void updateSettings({ theme: theme === 'dim' ? 'black' : 'dim' })}
          title={theme === 'dim' ? 'Включить чёрную тему' : 'Вернуть тему Dim'}
          aria-label={theme === 'dim' ? 'Включить чёрную тему' : 'Вернуть тему Dim'}
        >
          {theme === 'dim' ? <MoonIcon size={18} /> : <SunIcon size={18} />}
        </button>
        <span className="sidebar__version">
          v{version}
          {!isDesktop ? ' · демо' : ''}
        </span>
      </div>
    </aside>
  );
}

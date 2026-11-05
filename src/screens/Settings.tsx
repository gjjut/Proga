import { useMemo, useState } from 'react';
import type { ThemeMode } from '../../shared/model';
import {
  ArrowUpRightIcon,
  CheckIcon,
  DownloadIcon,
  FolderIcon,
  InfoIcon,
  MoonIcon,
  ShieldIcon,
  SunIcon,
  TrashIcon,
  UploadIcon,
} from '../components/Icons';
import { ConfirmDialog } from '../components/Modal';
import { recordsLabel } from '../lib/format';
import { useApp } from '../state';

const PLATFORM_LABELS: Record<string, string> = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
  browser: 'браузер (превью)',
};

const REPO_URL = 'https://github.com/gjjut/Proga';
const RELEASES_URL = `${REPO_URL}/releases`;

const THEMES: { id: ThemeMode; title: string; subtitle: string; bg: string; surface: string }[] = [
  {
    id: 'dim',
    title: 'Dim',
    subtitle: 'Фирменная тёмно-синяя тема X · #15202B',
    bg: '#15202B',
    surface: '#1E2732',
  },
  {
    id: 'black',
    title: 'Lights out',
    subtitle: 'Полностью чёрный режим X · #000000',
    bg: '#000000',
    surface: '#16181C',
  },
];

const FORMULAS: { label: string; value: string }[] = [
  { label: 'Выручка', value: 'сумма всех значений «Сумма по терминалу»' },
  { label: 'Расходы', value: 'сумма всех строк расходов' },
  { label: 'НЗ', value: 'сумма всех значений «Положено в НЗ»' },
  { label: 'Остаток', value: 'выручка − расходы − НЗ' },
  { label: 'Наличные в кассе', value: 'остаток по самой свежей записи компании' },
  { label: 'Остаток дня', value: 'терминал − расходы − НЗ за конкретный день' },
];

export function Settings() {
  const {
    data,
    info,
    isDesktop,
    updateSettings,
    exportBackup,
    importBackup,
    clearAll,
    openDataFolder,
    openExternal,
  } = useApp();
  const [confirmClear, setConfirmClear] = useState(false);

  const companyCounts = useMemo(
    () => ({
      zaton: data.records.filter((record) => record.company === 'zaton').length,
      artfokus: data.records.filter((record) => record.company === 'artfokus').length,
    }),
    [data.records],
  );

  const theme = data.settings.theme;

  return (
    <div className="screen">
      <header className="screen__header">
        <div className="screen__title-wrap">
          <h1 className="screen__title">Настройки</h1>
          <p className="screen__subtitle">Внешний вид, данные и справка</p>
        </div>
      </header>

      <section className="card card--pad settings-block">
        <div className="settings-block__head">
          <h2 className="card__title">Оформление</h2>
          <p className="card__hint">Тёмная тема включена всегда — как в X, с двумя вариантами фона</p>
        </div>
        <div className="theme-options">
          {THEMES.map((item) => {
            const active = theme === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`theme-option${active ? ' is-active' : ''}`}
                onClick={() => void updateSettings({ theme: item.id })}
                aria-pressed={active}
              >
                <span className="theme-option__preview" style={{ background: item.bg }}>
                  <span className="theme-option__preview-card" style={{ background: item.surface }} />
                  <span className="theme-option__preview-line" />
                  <span className="theme-option__preview-line theme-option__preview-line--short" />
                </span>
                <span className="theme-option__text">
                  <strong>
                    {item.id === 'dim' ? <MoonIcon size={16} /> : <SunIcon size={16} />}
                    {item.title}
                  </strong>
                  <small>{item.subtitle}</small>
                </span>
                <span className={`theme-option__check${active ? ' is-active' : ''}`}>
                  {active ? <CheckIcon size={14} /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card card--pad settings-block">
        <div className="settings-block__head">
          <h2 className="card__title">Данные</h2>
          <p className="card__hint">
            {isDesktop
              ? 'Всё хранится локально в JSON-файле — без сервера и аккаунтов'
              : 'В браузере данные лежат в localStorage этого профиля'}
          </p>
        </div>

        <div className="data-path">
          <span className="data-path__label">Файл данных</span>
          <code className="data-path__value">{info?.dataPath ?? '…'}</code>
        </div>

        <div className="data-stats">
          <div className="data-stat">
            <span>Всего записей</span>
            <strong>{data.records.length}</strong>
          </div>
          <div className="data-stat">
            <span>Затон Рыбака</span>
            <strong>{companyCounts.zaton}</strong>
          </div>
          <div className="data-stat">
            <span>Арт Фокус</span>
            <strong>{companyCounts.artfokus}</strong>
          </div>
          <div className="data-stat">
            <span>Режим</span>
            <strong>{info?.portable ? 'Portable' : isDesktop ? 'Установленное' : 'Браузер'}</strong>
          </div>
        </div>

        <div className="settings-actions">
          <button type="button" className="btn btn--ghost" onClick={() => void openDataFolder()} disabled={!isDesktop}>
            <FolderIcon size={17} />
            <span>Открыть папку с данными</span>
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => void exportBackup()}>
            <DownloadIcon size={17} />
            <span>Скачать резервную копию</span>
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => void importBackup()}>
            <UploadIcon size={17} />
            <span>Загрузить копию</span>
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--danger-hover"
            onClick={() => setConfirmClear(true)}
            disabled={data.records.length === 0}
          >
            <TrashIcon size={17} />
            <span>Очистить все записи</span>
          </button>
        </div>

        <p className="settings-note">
          <ShieldIcon size={16} />
          <span>
            {recordsLabel(data.records.length)}. Перед каждой записью автоматически создаётся файл
            <code> finance-data.backup.json</code> — при повреждении основного файла данные
            восстановятся из него.
          </span>
        </p>
      </section>

      <section className="card card--pad settings-block">
        <div className="settings-block__head">
          <h2 className="card__title">Как считаются показатели</h2>
          <p className="card__hint">Все суммы пересчитываются сразу после сохранения или удаления</p>
        </div>
        <dl className="formula-list">
          {FORMULAS.map((formula) => (
            <div key={formula.label} className="formula-list__row">
              <dt>{formula.label}</dt>
              <dd>{formula.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card card--pad settings-block">
        <div className="settings-block__head">
          <h2 className="card__title">О приложении</h2>
          <p className="card__hint">Локальный финансовый трекер для двух компаний</p>
        </div>

        <div className="about-grid">
          <div className="about-item">
            <span>Версия</span>
            <strong>{info?.version ?? __APP_VERSION__}</strong>
          </div>
          <div className="about-item">
            <span>Electron</span>
            <strong>{info?.electron && info.electron !== '—' ? info.electron : 'браузер'}</strong>
          </div>
          <div className="about-item">
            <span>Платформа</span>
            <strong>{PLATFORM_LABELS[info?.platform ?? ''] ?? info?.platform ?? '—'}</strong>
          </div>
        </div>

        <div className="settings-actions">
          <button type="button" className="btn btn--ghost" onClick={() => void openExternal(RELEASES_URL)}>
            <DownloadIcon size={17} />
            <span>Проверить обновления</span>
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => void openExternal(REPO_URL)}>
            <ArrowUpRightIcon size={17} />
            <span>Исходный код на GitHub</span>
          </button>
        </div>

        <p className="settings-note settings-note--muted">
          <InfoIcon size={16} />
          <span>
            Обновления выходят автоматически при появлении нового тега версии: скачайте новый
            установщик или portable-версию со страницы релизов. Файл данных при обновлении не
            затрагивается.
          </span>
        </p>
      </section>

      <ConfirmDialog
        open={confirmClear}
        title="Очистить все записи?"
        description={
          <>
            Будут удалены <strong>все {data.records.length} записей</strong> обеих компаний.
            Действие необратимо — сначала лучше скачать резервную копию.
          </>
        }
        confirmLabel="Удалить всё"
        onConfirm={() => {
          setConfirmClear(false);
          void clearAll();
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}

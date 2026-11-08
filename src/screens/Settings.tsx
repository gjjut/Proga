import { useMemo, useState } from 'react';
import type { ThemeMode } from '../../shared/model';
import {
  ArrowUpRightIcon,
  BanknoteIcon,
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
import { formatPercent, parseMoneyInput, recordsLabel } from '../lib/format';
import { useApp } from '../state';

const PLATFORM_LABELS: Record<string, string> = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
  browser: 'браузер (превью)',
};

const REPO_URL = 'https://github.com/gjjut/Proga';
const RELEASES_URL = `${REPO_URL}/releases`;

const THEMES: { id: ThemeMode; title: string; subtitle: string; bg: string; surface: string; line: string }[] = [
  {
    id: 'black',
    title: 'Чёрная',
    subtitle: 'Чёрный фон, белый текст · #000000',
    bg: '#000000',
    surface: '#141619',
    line: '#ffffff',
  },
  {
    id: 'light',
    title: 'Белая',
    subtitle: 'Белый фон, чёрный текст · #FFFFFF',
    bg: '#FFFFFF',
    surface: '#F2F3F4',
    line: '#0f1419',
  },
];

const FORMULAS: { label: string; value: string }[] = [
  { label: 'Изменение наличных', value: '(нал вечером − НЗ) − остаток наличных вчера' },
  {
    label: 'Нал вечером',
    value: 'всё, что насчитали в кассе на конец дня, — вместе с отложенным в НЗ',
  },
  { label: 'В кассе после НЗ', value: 'нал вечером − НЗ · именно этот остаток переходит на завтра' },
  {
    label: 'Итог наличными',
    value: 'нал вечером + расходы − остаток наличных вчера',
  },
  { label: 'Итог дня', value: 'терминал + итог наличными' },
  { label: 'Комиссия банка', value: 'терминал × ставка (по умолчанию 2,75%), на НЗ и наличные не начисляется' },
  {
    label: 'НЗ',
    value: 'отложено в неприкосновенный запас: не расход, а третье место хранения денег',
  },
  {
    label: 'Движение в НЗ',
    value: 'положили — ушло из кассы, забрали — вернулось; итог остатка не меняется',
  },
  { label: 'Заработано за день', value: 'итог − комиссия − расходы' },
  {
    label: 'То же короче',
    value: 'терминал − комиссия + изменение наличных + НЗ (расходы уже внутри кассы)',
  },
  { label: 'Заработано за период', value: 'Σ итога дней − комиссия − расходы' },
  {
    label: 'Проверка',
    value: 'остаток + НЗ = стартовая касса + заработано за всё время ± движения денег',
  },
  {
    label: 'Цепочка наличных',
    value: '«касса вчера» = остаток прошлой записи после НЗ с учётом движений; иначе появится предупреждение',
  },
  {
    label: 'Касса вчера',
    value: 'факт прошлой записи компании ± движения по кассе и НЗ между днями',
  },
  {
    label: 'Наличные в кассе',
    value: 'нал вечером последней записи − НЗ ± движения по кассе и НЗ после неё',
  },
  { label: 'На терминале', value: 'Σ терминал − комиссия банка ± пополнения и изъятия' },
  {
    label: 'Остаток в кассе',
    value: 'наличные после НЗ; НЗ показывается отдельно и в остаток не входит',
  },
  {
    label: 'Терминал',
    value: 'не остаток: эти деньги уходят в банк, поэтому показываются отдельной суммой',
  },
  {
    label: 'Движения денег',
    value: 'поступления и изъятия меняют только остатки и не считаются заработком',
  },
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
    chooseBackupFolder,
    resetBackupFolder,
    openExternal,
    notify,
  } = useApp();
  const [confirmClear, setConfirmClear] = useState(false);
  const [rateInput, setRateInput] = useState(() => String(data.settings.commissionRate).replace('.', ','));

  const companyCounts = useMemo(
    () => ({
      zaton: data.records.filter((record) => record.company === 'zaton').length,
      artfokus: data.records.filter((record) => record.company === 'artfokus').length,
    }),
    [data.records],
  );

  const theme = data.settings.theme;
  const parsedRate = parseMoneyInput(rateInput);
  const rateValid = parsedRate > 0 && parsedRate <= 100;

  const saveRate = () => {
    if (!rateValid) {
      notify('Ставка должна быть больше 0 и не больше 100%', 'error');
      return;
    }
    void updateSettings({ commissionRate: parsedRate }).then((saved) => {
      if (saved) notify('Ставка комиссии обновлена', 'success');
    });
  };

  return (
    <div className="screen">
      <header className="screen__header">
        <div className="screen__title-wrap">
          <h1 className="screen__title">Настройки</h1>
          <p className="screen__subtitle">Внешний вид, комиссия банка, данные и справка</p>
        </div>
      </header>

      <section className="card card--pad settings-block">
        <div className="settings-block__head">
          <h2 className="card__title">Оформление</h2>
          <p className="card__hint">Чёрно-белая тема, как в X: два варианта фона, без цветных акцентов</p>
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
                  <span
                    className="theme-option__preview-line"
                    style={{ background: item.line }}
                  />
                  <span
                    className="theme-option__preview-line theme-option__preview-line--short"
                    style={{ background: item.line, opacity: 0.5 }}
                  />
                </span>
                <span className="theme-option__text">
                  <strong>
                    {item.id === 'black' ? <MoonIcon size={16} /> : <SunIcon size={16} />}
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
          <h2 className="card__title">Комиссия банка</h2>
          <p className="card__hint">
            Удерживается с суммы по терминалу. Сейчас применяется ставка{' '}
            {formatPercent(data.settings.commissionRate)}
          </p>
        </div>

        <div className="rate-row">
          <label className="field rate-field">
            <span className="field__label">Ставка эквайринга</span>
            <div className="rate-field__control">
              <input
                className="input"
                type="text"
                inputMode="decimal"
                value={rateInput}
                onChange={(event) => setRateInput(event.target.value.replace(/[^\d.,]/g, ''))}
                onBlur={() => {
                  if (rateValid) setRateInput(String(parsedRate).replace('.', ','));
                }}
                aria-label="Ставка комиссии банка в процентах"
              />
              <span className="rate-field__suffix">%</span>
            </div>
          </label>
          <button
            type="button"
            className="btn btn--primary"
            onClick={saveRate}
            disabled={!rateValid || parsedRate === data.settings.commissionRate}
          >
            <BanknoteIcon size={17} />
            <span>Применить ставку</span>
          </button>
        </div>

        <p className="settings-note">
          <InfoIcon size={16} />
          <span>
            Ставка применяется ко всем записям при пересчёте: комиссия = сумма по терминалу ×
            ставка. На НЗ комиссия не начисляется. Поступления через терминал в разделе «Движения»
            тоже учитываются за вычетом комиссии.
          </span>
        </p>
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

        {isDesktop && <>
          <div className="data-path">
            <span className="data-path__label">Автоматические копии</span>
            <code className="data-path__value">{info?.backupDirectory ?? '…'}</code>
          </div>
          <div className="settings-actions">
            <button type="button" className="btn btn--ghost" onClick={() => void chooseBackupFolder()}>
              <FolderIcon size={17} /> <span>Выбрать папку копий</span>
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => void resetBackupFolder()}>
              <span>Папка по умолчанию</span>
            </button>
          </div>
          <p className="settings-note">В каждой папке хранится до 30 дней копий: первая и последняя за день, а также копии перед удалением и восстановлением. Программа делает копии при запуске, изменениях и каждый час, пока открыта. Данные в копиях не зашифрованы. Для облака выберите папку синхронизации; доступность облака приложение не проверяет.</p>
        </>}

        <div className="data-stats">
          <div className="data-stat">
            <span>Записей дней</span>
            <strong>{data.records.length}</strong>
          </div>
          <div className="data-stat">
            <span>Движений денег</span>
            <strong>{data.adjustments.length}</strong>
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
            disabled={data.records.length === 0 && data.adjustments.length === 0}
          >
            <TrashIcon size={17} />
            <span>Очистить все данные</span>
          </button>
        </div>

        <p className="settings-note">
          <ShieldIcon size={16} />
          <span>
            {recordsLabel(data.records.length)} и {data.adjustments.length} движений.
            {isDesktop ? ' Перед перезаписью файла сохраняется предыдущая версия в finance-data.backup.json.' : ' В браузере автоматические копии не создаются — сохраняйте резервную копию вручную.'}
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
        title="Очистить все данные?"
        description={
          <>
            Будут удалены <strong>все {data.records.length} записей</strong> и{' '}
            <strong>{data.adjustments.length} движений</strong> обеих компаний. Действие
            необратимо — сначала лучше скачать резервную копию.
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

import fs from 'node:fs';
import path from 'node:path';
import type { AppData } from '../shared/model';

const PREFIX = 'zaton-finance-';
const PATTERN = /^zaton-finance-(\d{4}-\d{2}-\d{2})-(?:start|latest|before-[a-z0-9-]+)\.json$/;
const KEEP_DAYS = 30;

function localDate(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** Daily first and latest snapshots. Files in the chosen folder are not backups until sync completes. */
export class AutoBackup {
  readonly defaultDir: string;
  private readonly configFile: string;
  private directory: string;
  private configProblem = false;
  warning: string | undefined;

  constructor(dataDir: string) {
    this.defaultDir = path.join(dataDir, 'backups');
    this.configFile = path.join(dataDir, 'backup-config.json');
    this.directory = this.defaultDir;
    try {
      const raw: unknown = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      if (!raw || typeof raw !== 'object' || typeof (raw as { directory?: unknown }).directory !== 'string' ||
          !path.isAbsolute((raw as { directory: string }).directory)) throw new Error('Неверная папка');
      this.directory = (raw as { directory: string }).directory;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.configProblem = true;
        this.warning = 'Не удалось прочитать настройки автокопирования. Проверьте папку копий в настройках.';
      }
    }
  }

  get folder(): string { return this.directory; }

  private writeSnapshot(directory: string, data: AppData, date = new Date()): void {
    fs.mkdirSync(directory, { recursive: true });
    const day = localDate(date);
    const content = `${JSON.stringify(data, null, 2)}\n`;
    const first = path.join(directory, `${PREFIX}${day}-start.json`);
    if (!fs.existsSync(first)) {
      const firstTemp = `${first}.tmp`;
      try {
        fs.writeFileSync(firstTemp, content, 'utf8');
        fs.renameSync(firstTemp, first);
      } finally {
        try { fs.unlinkSync(firstTemp); } catch { /* absent or inaccessible */ }
      }
    }
    const latest = path.join(directory, `${PREFIX}${day}-latest.json`);
    const temp = `${latest}.tmp`;
    try {
      fs.writeFileSync(temp, content, 'utf8');
      fs.renameSync(temp, latest);
    } finally {
      try { fs.unlinkSync(temp); } catch { /* absent or inaccessible */ }
    }
    const names = fs.readdirSync(directory);
    const days = [...new Set(names.map((name) => PATTERN.exec(name)?.[1]).filter((value): value is string => Boolean(value)))].sort().reverse();
    const expired = new Set(days.slice(KEEP_DAYS));
    for (const name of names) {
      const match = PATTERN.exec(name);
      if (match && expired.has(match[1])) fs.unlinkSync(path.join(directory, name));
    }
  }

  /** Destructive operations require an additional snapshot before changing data. */
  checkpoint(data: AppData): void {
    if (this.configProblem) throw new Error(this.warning);
    const name = `${PREFIX}${localDate(new Date())}-before-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.json`;
    const file = path.join(this.directory, name);
    const temp = `${file}.tmp`;
    try {
      fs.mkdirSync(this.directory, { recursive: true });
      fs.writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      fs.renameSync(temp, file);
    } catch (error) {
      console.error('Не удалось создать копию перед удалением или восстановлением:', error);
      throw new Error('Не удалось создать копию перед изменением данных. Проверьте папку автоматических копий в настройках.');
    } finally {
      try { fs.unlinkSync(temp); } catch { /* absent or inaccessible */ }
    }
  }

  /** Copy errors do not undo a successful data save, but are reported persistently. */
  snapshot(data: AppData, date = new Date()): void {
    if (this.configProblem) return;
    try {
      this.writeSnapshot(this.directory, data, date);
      this.warning = undefined;
    } catch (error) {
      this.warning = `Не удалось создать автоматическую копию в ${this.directory}. Проверьте доступ к папке и сохраните копию вручную.`;
      console.error(this.warning, error);
    }
  }

  /** Only switch folders after a successful copy and durable config update. */
  setFolder(directory: string, data: AppData): void {
    if (!path.isAbsolute(directory)) throw new Error('Укажите абсолютный путь к папке');
    this.writeSnapshot(directory, data);
    fs.mkdirSync(path.dirname(this.configFile), { recursive: true });
    const temp = `${this.configFile}.tmp`;
    try {
      fs.writeFileSync(temp, `${JSON.stringify({ directory }, null, 2)}\n`, 'utf8');
      fs.renameSync(temp, this.configFile);
    } finally {
      try { fs.unlinkSync(temp); } catch { /* absent or inaccessible */ }
    }
    this.directory = directory;
    this.configProblem = false;
    this.warning = undefined;
  }
}

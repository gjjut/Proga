import { describe, expect, it } from 'vitest';
import { createEmptyData, parseBackupData, SCHEMA_VERSION, upsertRecord } from '../shared/model';

describe('проверка импортируемых копий', () => {
  it('принимает актуальную копию и формат старой схемы без движений', () => {
    const data = upsertRecord(createEmptyData(), { company: 'zaton', date: '2026-11-05', terminal: 100, cashPrev: 0, cashFact: 20, reserve: 0, expenses: [] });
    expect(parseBackupData(data)).toEqual(data);
    expect(parseBackupData({ schemaVersion: 1, records: [{ company: 'zaton', date: '2026-11-05', cash: 20 }] }).records[0].cashFact).toBe(20);
  });
  it.each([null, {}, [], { records: null }, { records: [], adjustments: null }])('отклоняет неверный формат %j', (raw) => {
    expect(() => parseBackupData(raw)).toThrow('Неверный формат');
  });
  it('не импортирует файлы будущей схемы', () => {
    expect(() => parseBackupData({ ...createEmptyData(), schemaVersion: SCHEMA_VERSION + 1 })).toThrow('более новой');
  });
  it('не теряет ошибочные записи и движения незаметно', () => {
    expect(() => parseBackupData({ records: [{ date: 'invalid' }] })).toThrow('некорректные');
    expect(() => parseBackupData({ records: [], adjustments: [{}] })).toThrow('некорректные');
  });
});

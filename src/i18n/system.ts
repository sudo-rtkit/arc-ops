/* Texty, které nevznikají ve slovníku: chybové hlášky úložiště (Rust a localStorage vrací česky, aby se neměnilo
   rozhraní úložiště ani soubory na disku) a popisky automatických snímků (jsou součástí názvu souboru snímku).
   Pro angličtinu se známé české začátky přeloží, zbytek (např. text chyby systému) zůstane, jak je. */
import type { Lang } from './index';

const SYS_EN: [string, string][] = [
  ['Úložiště je zablokované', 'Storage is locked'],
  ['Neplatná cesta', 'Invalid path'],
  ['Soubor nejde přečíst', 'The file cannot be read'],
  ['Odkaz není povolený', 'The link is not allowed'],
  ['Složka dat není dostupná', 'The data folder is not available'],
  ['Nelze vytvořit složku dat', 'Cannot create the data folder'],
  ['Nelze zapsat dočasný soubor', 'Cannot write the temporary file'],
  ['Zápis na disk selhal', 'Writing to disk failed'],
  ['Zápis selhal', 'Write failed'],
  ['Přejmenování selhalo', 'Rename failed'],
  ['Stav není platný JSON', 'The state is not valid JSON'],
  ['Záloha předchozího stavu selhala', 'Backing up the previous state failed'],
  ['Neplatný typ snímku', 'Invalid snapshot type'],
  ['Snímek není platný JSON', 'The snapshot is not valid JSON'],
  ['Nelze vytvořit složku snímků', 'Cannot create the snapshot folder'],
  ['Nelze číst snímky', 'Cannot read snapshots'],
  ['Neplatný název snímku', 'Invalid snapshot name'],
  ['Snímek nejde přečíst', 'The snapshot cannot be read'],
  ['Snímek neexistuje', 'The snapshot does not exist'],
];

export function sysError(msg: string, lang: Lang): string {
  if (lang !== 'en') return msg;
  for (const [cs, en] of SYS_EN) if (msg.startsWith(cs)) return en + msg.slice(cs.length);
  return msg;
}

/* Popisky snímků, které vytváří aplikace (ASCII slug v názvu souboru). Vlastní popisek uživatele se nemění. */
const SNAP_EN: [RegExp, string][] = [
  [/^start$/, 'startup'], [/^rucni$/, 'manual'], [/^pred obnovou$/, 'before restore'], [/^pred importem deniku$/, 'before diary import'],
  [/^pred importem$/, 'before import'], [/^pred uplnym resetem$/, 'before full reset'], [/^pred resetem (.+)$/, 'before reset $1'],
];
export function snapshotLabel(label: string, lang: Lang): string {
  if (lang !== 'en') return label;
  for (const [re, en] of SNAP_EN) if (re.test(label)) return label.replace(re, en);
  return label;
}

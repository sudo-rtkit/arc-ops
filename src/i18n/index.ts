/* Vlastní typovaný slovník bez knihovny. Čistý TypeScript bez Reactu: používá ho jádro, store i UI.
   cs.ts je zdroj pravdy (odvozuje se z něj typ klíčů), en.ts musí mít všechny klíče, jinak je to chyba tsc.
   Jazyk drží modul; store ho při startu a při změně nastavení přepne (setLang), UI se překreslí přes useT().
   0.19.0: funkce jsou v core.ts; tady se jen přidají oba slovníky (okno buddyho importuje jen core.ts). */
import { cs } from './cs';
import { en } from './en';
import { registerDicts } from './core';

registerDicts({ cs, en });

export * from './core';

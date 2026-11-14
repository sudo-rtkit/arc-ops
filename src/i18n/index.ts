/* Vlastní typovaný slovník bez knihovny. Čistý TypeScript bez Reactu: používá ho jádro, store i UI.
   cs.ts je zdroj pravdy (odvozuje se z něj typ klíčů), en.ts musí mít všechny klíče, jinak je to chyba tsc.
   Jazyk drží modul; store ho při startu a při změně nastavení přepne (setLang), UI se překreslí přes useT().
   0.19.0: funkce jsou v core.ts; okno buddyho importuje jen core.ts.
   0.25.0: slovníky se nevkládají do balíku okna: každý jazyk je samostatný balík a načte se, až je potřeba
   (registerLoader). Okno tak při startu načte jen slovník aktivního jazyka; přepnutí viz setLang v core.ts. */
import { registerLoader } from './core';

registerLoader(lang => (lang === 'en' ? import('./en').then(m => m.en) : import('./cs').then(m => m.cs)));

export * from './core';

/* 0.25.0: aplikace načítá slovníky po jazycích (src/i18n/index.ts); testy v Node je mají oba hned, takže texty
   i přepnutí jazyka fungují synchronně jako dřív. */
import { registerDicts } from '../src/i18n/core';
import { cs } from '../src/i18n/cs';
import { en } from '../src/i18n/en';

registerDicts({ cs, en });

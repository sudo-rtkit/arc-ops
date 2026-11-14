/* Vzory ikony druhu munice v místě zbraně jako malé mřížky ICON_W × ICON_H (podíl krémového inkoustu × 15 jako
   šestnáctková číslice) s poměrem stran a. Vygenerováno z vlastních snímků hráče testem tests/vision/ammo.gen.test.ts
   (GEN_AMMO=1, potřebuje lokální vlastní snímky). Jde o tvar ikony v číslech, ne o herní grafiku. Vzory jsou jen pro
   druhy, které na snímcích jsou (lehká, střední, těžká); ostatní druhy se nepoznají (čtení je pak nejisté). */
import type { AmmoIconTemplate } from './ammoIcon';
export const AMMO_ICONS: AmmoIconTemplate[] = [
  { t: 'heavy', a: 1.042, rows: ['2dc100000000', '6ffd10000000', '1ae642000000', '0044ee500000', '001efff30000', '0004effd2000', '00006ffff200', '000009fffb00', '0000004effb0', '00000005ff52', '00000000781e', '0000000001e9'] }, // 1366 px, Ferro II, Ferro I, Anvil IV
  { t: 'heavy', a: 1, rows: ['2f6000000000', 'fff700000000', '6ff520000000', '0754fa000000', '002fffa00000', '000afffa0000', '0000afffa000', '00000afffa00', '000000afff90', '0000000aff44', '00000000945f', '0000000004f5'] }, // 1920 px, Ferro II, Ferro I, Anvil IV
  { t: 'heavy', a: 1, rows: ['ae4000000000', 'ffe500000000', '7fc150000000', '071af9000000', '008fff700000', '001cfff70000', '0001afff9000', '00000afffa00', '000001cfff70', '0000001dff32', '00000001a36d', '0000000004e3'] }, // 2560 px, Ferro II, Ferro I, Anvil IV
  { t: 'light', a: 1.03, rows: ['8e02d30b40c8', '9e15e30ca0da', '251152043054', 'bf48f50fd0fd', 'bf48f50fe1fd', 'bf48f50fe1fd', 'bf48f50fe1fd', 'bf48f50fe1fd', 'bf48f50fe1fd', 'af37f50ed0fc', '000000000000', '7b25b30a90b9'] }, // 1366 px, Kettle I, Stitcher I
  { t: 'light', a: 1, rows: ['b906e00f40b9', '770482284077', '880583385088', 'ff09f66f90ff', 'ff09f66f90ff', 'ff09f66f90ff', 'ff09f66f90ff', 'ff09f66f90ff', 'ff09f66f90ff', 'ff09f55f90ff', '000000000000', 'ff09f66f90ff'] }, // 1920 px, Kettle I, Stitcher I
  { t: 'light', a: 1, rows: ['a904d00d3087', '9905a11a5087', '660462263055', 'ff0af55f80dd', 'ff0af55f80dd', 'ff0af55f80dd', 'ff0af55f80dd', 'ff0af55f80dd', 'ff0af55f80dd', 'ff0af55f80dd', '330231131033', 'ed09e44d70cc'] }, // 2560 px, Kettle I, Stitcher I
  { t: 'medium', a: 1, rows: ['000000000009', '194cfffffe0c', '8d5cfffffe0c', '000011111108', '000000000003', '0539dddddb0c', 'df6dfffffe0c', '27379999980c', '000000000000', '011355555407', 'bf6dfffffe0c', '4839bbbbba0c'] }, // 1366 px, Torrente II
  { t: 'medium', a: 1.091, rows: ['053affffff0f', 'af4bffffff0f', '1728bbbbbb0f', '000000000004', '000000000009', '5d4bffffff0f', 'bf4bffffff0f', '05268888880f', '000000000001', '00023333330c', '8e4bffffff0f', '3a3bffffff0f'] }, // 1920 px, Torrente II
  { t: 'medium', a: 1.033, rows: ['260acccccc1d', 'dd1dffffff2d', '1408aaaaaa1d', '000000000003', '000000000008', '7a0ceeeeee1d', 'ad1dffffff2d', '02034444440a', '000000000000', '13057777770b', 'dd1dffffff2d', '680bdddddd1d'] }, // 2560 px, Torrente II
];

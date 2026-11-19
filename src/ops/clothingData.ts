/* Líné načítání geometrie oblečení (0.34.0). Každá varianta × podoba je samostatný balík (dynamický import JSON),
   který se stáhne jen tehdy, když Ops něco nosí (nebo ho šatník kreslí v náhledu). Okno bez oblečení nic z toho
   nenačte. Cesty k atlasům jsou jen ze zabaleného seznamu (import.meta.glob), nikdy ze stavu ani z dat hráče. */
import type { ClothingGeo } from '../core/clothingPlan';
import type { OpsVariantId } from '../core/ops';

const LOADERS = import.meta.glob<ClothingGeo>('../core/data/clothing/*.json', { import: 'default' });
const ATLASES = import.meta.glob('../assets/clothing/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/* undefined = zatím nenačteno, null = nejde načíst (oblečení se pak nekreslí) */
const geos = new Map<string, ClothingGeo | null>();
const pending = new Map<string, Promise<ClothingGeo | null>>();
let loads = 0;

const key = (variant: OpsVariantId, form: string) => variant + '-' + form;
/* Kolikrát se začal načítat některý balík geometrie (testy: bez oblečení se nenačte nic). */
export const clothingLoads = (): number => loads;

export function clothingGeo(variant: OpsVariantId, form: string): ClothingGeo | null | undefined {
  return geos.get(key(variant, form));
}

export function loadClothingGeo(variant: OpsVariantId, form: string): Promise<ClothingGeo | null> {
  const k = key(variant, form);
  if (geos.has(k)) return Promise.resolve(geos.get(k) ?? null);
  let p = pending.get(k);
  if (!p) {
    const load = LOADERS['../core/data/clothing/' + k + '.json'];
    loads++;
    p = (load ? load() : Promise.resolve(null))
      .then(g => (g && g.variant === variant && g.form === form ? g : null), () => null)
      .then(g => { geos.set(k, g); pending.delete(k); return g; });
    pending.set(k, p);
  }
  return p;
}

/* URL atlasu dílů (jen soubory zabalené s aplikací). */
export const atlasUrl = (file: string): string | undefined => (/^[a-z]+-[a-z]+\.png$/.test(file) ? ATLASES['../assets/clothing/' + file] : undefined);

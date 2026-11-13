/* Úvodní pozdrav okna buddyho nebo overlaye hlavnímu oknu (0.8.0). Bez něj okno nemá data a čeká („Načítám“).
   - Pozdrav se pošle až po bus.ready(), tedy když už okno poslouchá odpověď (v Tauri je listen() asynchronní).
   - Opakuje se s rostoucí pauzou, dokud nepřijde první odpověď (hlavní okno nemusí ještě poslouchat), nejvýš
     HELLO_DELAYS.length + 1 pokusů (zhruba půl minuty). Další data pak hlavní okno posílá samo při každé změně. */
import type { Bus } from './bus';

export const HELLO_DELAYS = [250, 500, 1000, 2000, 4000, 4000, 4000, 4000, 4000, 4000];

export function startHello(bus: Bus, from: 'buddy' | 'overlay' | 'widgets', answered: () => boolean): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let i = 0;
  const tick = () => {
    timer = null;
    if (stopped || answered()) return;
    bus.send('main', 'hello', { from });
    if (i < HELLO_DELAYS.length) timer = setTimeout(tick, HELLO_DELAYS[i++]);
  };
  void bus.ready().then(tick);
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

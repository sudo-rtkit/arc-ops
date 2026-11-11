/* Pomůcky sdílené moduly. */
import type { BranchId } from '../core/types';
import { MAPS } from '../core/data/maps';

export const MAP_COUNT = MAPS.length;
export const mapName = (id: string): string => MAPS.find(m => m.id === id)?.name || id;
export const branchVar = (b: BranchId): string => (b === 'c' ? 'var(--cond)' : b === 'm' ? 'var(--mob)' : 'var(--surv)');
export const branchName = (b: BranchId): string => (b === 'c' ? 'Conditioning' : b === 'm' ? 'Mobility' : 'Survival');

import type { MainWeaponId } from '$lib/constants/in-game/types';

// xxx: why not in the component?
export type BuildFilter = 'ALL' | 'PUBLIC' | 'PRIVATE' | MainWeaponId;

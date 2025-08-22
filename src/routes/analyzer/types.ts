import type { AbilityWithUnknown } from '$lib/constants/in-game/types';
import type { AbilityType } from '$lib/constants/in-game/types';

export interface AbilityItem {
	id: string;
	abilityType: AbilityType;
	ability: AbilityWithUnknown;
}

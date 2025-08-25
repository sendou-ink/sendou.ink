import type { AbilityWithUnknown, AbilityType } from '$lib/constants/in-game/types';
import { SHADOW_ITEM_MARKER_PROPERTY_NAME } from 'svelte-dnd-action';

export interface AbilityItem {
	id: string;
	abilityType: AbilityType;
	ability: AbilityWithUnknown;
}

export type AbilityItemWithShadow = AbilityItem & {
	[SHADOW_ITEM_MARKER_PROPERTY_NAME]?: boolean;
};

import type { ModeShort, StageId } from '$lib/constants/in-game/types';

export type MapPool = Map<ModeShort, Set<StageId>>;

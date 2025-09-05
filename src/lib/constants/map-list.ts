import { modesShort } from '$lib/constants/in-game/modes';
import type { ModeShort, StageId } from '$lib/constants/in-game/types';
import { BANNED_MAPS } from '$lib/constants/sendouq';
import invariant from '$lib/utils/invariant';
import { stagesObj as s } from './in-game/stage-ids';

export const SENDOUQ_DEFAULT_MAPS: Record<
	ModeShort,
	[StageId, StageId, StageId, StageId, StageId, StageId, StageId]
> = {
	TW: [
		s.EELTAIL_ALLEY,
		s.HAGGLEFISH_MARKET,
		s.UNDERTOW_SPILLWAY,
		s.WAHOO_WORLD,
		s.UM_AMI_RUINS,
		s.HUMPBACK_PUMP_TRACK,
		s.ROBO_ROM_EN
	],
	SZ: [
		s.HAGGLEFISH_MARKET,
		s.MAHI_MAHI_RESORT,
		s.INKBLOT_ART_ACADEMY,
		s.MAKOMART,
		s.HUMPBACK_PUMP_TRACK,
		s.CRABLEG_CAPITAL,
		s.ROBO_ROM_EN
	],
	TC: [
		s.ROBO_ROM_EN,
		s.EELTAIL_ALLEY,
		s.UNDERTOW_SPILLWAY,
		s.MUSEUM_D_ALFONSINO,
		s.MAKOMART,
		s.MANTA_MARIA,
		s.SHIPSHAPE_CARGO_CO
	],
	RM: [
		s.SCORCH_GORGE,
		s.HAGGLEFISH_MARKET,
		s.UNDERTOW_SPILLWAY,
		s.MUSEUM_D_ALFONSINO,
		s.FLOUNDER_HEIGHTS,
		s.CRABLEG_CAPITAL,
		s.MINCEMEAT_METALWORKS
	],
	CB: [
		s.SCORCH_GORGE,
		s.INKBLOT_ART_ACADEMY,
		s.BRINEWATER_SPRINGS,
		s.MANTA_MARIA,
		s.HUMPBACK_PUMP_TRACK,
		s.UM_AMI_RUINS,
		s.ROBO_ROM_EN
	]
};

for (const mode of modesShort) {
	invariant(
		SENDOUQ_DEFAULT_MAPS[mode].length === new Set(SENDOUQ_DEFAULT_MAPS[mode]).size,
		'Duplicate maps in SENDOUQ_DEFAULT_MAPS'
	);

	invariant(
		BANNED_MAPS[mode].every((stageId) => !SENDOUQ_DEFAULT_MAPS[mode].includes(stageId)),
		`Banned maps in the default map pool of ${mode}`
	);
}

export const sourceTypes = ['DEFAULT', 'TIEBREAKER', 'BOTH', 'TO', 'COUNTERPICK'] as const;

import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { BANNED_MAPS } from "~/features/sendouq-settings/banned-maps";
import invariant from "~/utils/invariant";
import type { ModeShort, StageId } from "../in-game-lists";
import { modesShort } from "../in-game-lists";
import { stagesObj as s } from "../in-game-lists/stage-ids";

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
		s.ROBO_ROM_EN,
	],
	SZ: [
		s.HAGGLEFISH_MARKET,
		s.MAHI_MAHI_RESORT,
		s.INKBLOT_ART_ACADEMY,
		s.MAKOMART,
		s.HUMPBACK_PUMP_TRACK,
		s.CRABLEG_CAPITAL,
		s.ROBO_ROM_EN,
	],
	TC: [
		s.ROBO_ROM_EN,
		s.EELTAIL_ALLEY,
		s.UNDERTOW_SPILLWAY,
		s.MUSEUM_D_ALFONSINO,
		s.MAKOMART,
		s.MANTA_MARIA,
		s.SHIPSHAPE_CARGO_CO,
	],
	RM: [
		s.SCORCH_GORGE,
		s.HAGGLEFISH_MARKET,
		s.UNDERTOW_SPILLWAY,
		s.MUSEUM_D_ALFONSINO,
		s.FLOUNDER_HEIGHTS,
		s.CRABLEG_CAPITAL,
		s.MINCEMEAT_METALWORKS,
	],
	CB: [
		s.SCORCH_GORGE,
		s.INKBLOT_ART_ACADEMY,
		s.BRINEWATER_SPRINGS,
		s.MANTA_MARIA,
		s.HUMPBACK_PUMP_TRACK,
		s.UM_AMI_RUINS,
		s.ROBO_ROM_EN,
	],
};

for (const mode of modesShort) {
	invariant(
		SENDOUQ_DEFAULT_MAPS[mode].length ===
			new Set(SENDOUQ_DEFAULT_MAPS[mode]).size,
		"Duplicate maps in SENDOUQ_DEFAULT_MAPS",
	);

	invariant(
		BANNED_MAPS[mode].every(
			(stageId) => !SENDOUQ_DEFAULT_MAPS[mode].includes(stageId),
		),
		`Banned maps in the default map pool of ${mode}`,
	);
}

export const sourceTypes = [
	"DEFAULT",
	"TIEBREAKER",
	"BOTH",
	"TO",
	"COUNTERPICK",
] as const;

// this is only used as a fallback, in the case that map list generation has a bug
export const DEFAULT_MAP_POOL = new MapPool([
	{ mode: "SZ", stageId: 6 },
	{ mode: "SZ", stageId: 8 },
	{ mode: "SZ", stageId: 9 },
	{ mode: "SZ", stageId: 15 },
	{ mode: "SZ", stageId: 17 },

	{ mode: "TC", stageId: 1 },
	{ mode: "TC", stageId: 2 },
	{ mode: "TC", stageId: 10 },
	{ mode: "TC", stageId: 14 },
	{ mode: "TC", stageId: 16 },

	{ mode: "RM", stageId: 0 },
	{ mode: "RM", stageId: 3 },
	{ mode: "RM", stageId: 9 },
	{ mode: "RM", stageId: 10 },
	{ mode: "RM", stageId: 17 },

	{ mode: "CB", stageId: 0 },
	{ mode: "CB", stageId: 1 },
	{ mode: "CB", stageId: 8 },
	{ mode: "CB", stageId: 14 },
	{ mode: "CB", stageId: 16 },
]);

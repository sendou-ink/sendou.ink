import { stagesObj as s, stageIds } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { MapPool } from "../map-list-generator/core/map-pool";

export const BANNED_MAPS: Record<ModeShort, StageId[]> = {
	TW: [],
	SZ: [s.STURGEON_SHIPYARD, s.EELTAIL_ALLEY],
	TC: [
		s.WAHOO_WORLD,
		s.FLOUNDER_HEIGHTS,
		s.BRINEWATER_SPRINGS,
		s.SCORCH_GORGE,
		s.MAHI_MAHI_RESORT,
		s.MINCEMEAT_METALWORKS,
		s.HUMPBACK_PUMP_TRACK,
		s.BLUEFIN_DEPOT,
		s.CRABLEG_CAPITAL,
		s.MARLIN_AIRPORT,
		s.LEMURIA_HUB,
	],
	RM: [
		s.EELTAIL_ALLEY,
		s.WAHOO_WORLD,
		s.BRINEWATER_SPRINGS,
		s.BLUEFIN_DEPOT,
		s.STURGEON_SHIPYARD,
		s.INKBLOT_ART_ACADEMY,
		s.SHIPSHAPE_CARGO_CO,
		s.MAHI_MAHI_RESORT,
		s.MARLIN_AIRPORT,
		s.HAMMERHEAD_BRIDGE,
		s.LEMURIA_HUB,
	],
	CB: [
		s.HAMMERHEAD_BRIDGE,
		s.STURGEON_SHIPYARD,
		s.WAHOO_WORLD,
		s.FLOUNDER_HEIGHTS,
		s.MINCEMEAT_METALWORKS,
		s.EELTAIL_ALLEY,
		s.UNDERTOW_SPILLWAY,
		s.MAHI_MAHI_RESORT,
		s.BLUEFIN_DEPOT,
		s.MARLIN_AIRPORT,
		s.LEMURIA_HUB,
	],
};

export const SENDOUQ_MAP_POOL = new MapPool({
	TW: stageIds.filter((stageId) => !BANNED_MAPS.TW.includes(stageId)),
	SZ: stageIds.filter((stageId) => !BANNED_MAPS.SZ.includes(stageId)),
	TC: stageIds.filter((stageId) => !BANNED_MAPS.TC.includes(stageId)),
	RM: stageIds.filter((stageId) => !BANNED_MAPS.RM.includes(stageId)),
	CB: stageIds.filter((stageId) => !BANNED_MAPS.CB.includes(stageId)),
});

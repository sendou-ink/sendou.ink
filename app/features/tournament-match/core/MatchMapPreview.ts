/**
 * Browsing a match's maps ahead of time in its banner. At a LAN, players can step from the banner of
 * the match's current state to the maps of its upcoming games, e.g. to warm up on the next map or
 * look at the TO picked map list of a match whose teams aren't known yet.
 */

import type { TournamentRoundMaps } from "~/db/tables-json";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";

interface PreviewMap {
	mode: ModeShort;
	stageId: StageId;
}

/**
 * The upcoming games of the match whose map is settled, in game order. Upcoming = after the current
 * game, or from it on when the banner isn't showing its map (pick/ban, waiting for teams…). Settled
 * maps come from the resolved map list once the match has one, else from the round's map list (TO
 * picked maps only, team picked rounds have none), which before the teams are known is only final
 * without pick/ban or for a counterpick round's first game.
 */
export function upcomingMaps({
	mapList,
	roundMaps,
	current,
}: {
	mapList: Array<
		PreviewMap & { bannedByTournamentTeamId?: number | null }
	> | null;
	roundMaps: Pick<TournamentRoundMaps, "count" | "pickBan" | "list">;
	current: { gameIndex: number; isMapShown: boolean };
}): Array<{ gameIndex: number; map: PreviewMap }> {
	const firstUpcomingIndex = current.isMapShown
		? current.gameIndex + 1
		: current.gameIndex;

	return settledMaps({ mapList, roundMaps })
		.slice(0, roundMaps.count)
		.map((map, gameIndex) => ({ gameIndex, map }))
		.slice(firstUpcomingIndex);
}

function settledMaps({
	mapList,
	roundMaps,
}: Pick<Parameters<typeof upcomingMaps>[0], "mapList" | "roundMaps">) {
	if (mapList) {
		const banCount = mapList.filter(
			(map) => map.bannedByTournamentTeamId,
		).length;
		// which maps are left to play is only known once both teams have banned
		if (roundMaps.pickBan === "BAN_2" && banCount < 2) return [];

		return mapList
			.filter((map) => !map.bannedByTournamentTeamId)
			.map(({ mode, stageId }) => ({ mode, stageId }));
	}

	switch (roundMaps.pickBan) {
		case "COUNTERPICK":
		case "COUNTERPICK_MODE_REPEAT_OK":
			return roundMaps.list?.slice(0, 1) ?? [];
		case "BAN_2":
		case "CUSTOM":
			return [];
		default:
			return roundMaps.list ?? [];
	}
}

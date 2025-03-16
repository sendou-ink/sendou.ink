import type { Params } from "@remix-run/react";
import type { Tournament } from "~/db/types";
import type { ModeShort, StageId } from "~/modules/in-game-lists";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import { weekNumberToDate } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { tournamentLogoUrl } from "~/utils/urls";
import type { Tables, TournamentStageSettings } from "../../db/tables";
import { assertUnreachable } from "../../utils/types";
import { MapPool } from "../map-list-generator/core/map-pool";
import { currentSeason } from "../mmr/season";
import { BANNED_MAPS } from "../sendouq-settings/banned-maps";
import type { Tournament as TournamentClass } from "../tournament-bracket/core/Tournament";
import type { TournamentData } from "../tournament-bracket/core/Tournament.server";
import type { PlayedSet } from "./core/sets.server";
import { LEAGUES, TOURNAMENT } from "./tournament-constants";

export function tournamentIdFromParams(params: Params<string>) {
	const result = Number(params.id);
	invariant(!Number.isNaN(result), "id is not a number");

	return result;
}

export function modesIncluded(
	tournament: Pick<Tournament, "mapPickingStyle">,
): ModeShort[] {
	switch (tournament.mapPickingStyle) {
		case "AUTO_SZ": {
			return ["SZ"];
		}
		case "AUTO_TC": {
			return ["TC"];
		}
		case "AUTO_RM": {
			return ["RM"];
		}
		case "AUTO_CB": {
			return ["CB"];
		}
		default: {
			return [...rankedModesShort];
		}
	}
}

export function isOneModeTournamentOf(
	tournament: Pick<Tournament, "mapPickingStyle">,
) {
	return modesIncluded(tournament).length === 1
		? modesIncluded(tournament)[0]
		: null;
}

export function tournamentRoundI18nKey(round: PlayedSet["round"]) {
	if (round.round === "grand_finals") return "bracket.grand_finals";
	if (round.round === "bracket_reset") {
		return "bracket.grand_finals.bracket_reset";
	}
	if (round.round === "finals") return `bracket.${round.type}.finals` as const;

	return `bracket.${round.type}` as const;
}

// legacy approach, new tournament should use the avatarImgId column in CalendarEvent
export function HACKY_resolvePicture(event: { name: string }) {
	const normalizedEventName = event.name.toLowerCase();

	if (normalizedEventName.includes("sendouq")) {
		return tournamentLogoUrl("sf");
	}

	if (normalizedEventName.includes("paddling pool")) {
		return tournamentLogoUrl("pp");
	}

	if (normalizedEventName.includes("in the zone")) {
		return tournamentLogoUrl("itz");
	}

	if (normalizedEventName.includes("picnic")) {
		return tournamentLogoUrl("pn");
	}

	if (normalizedEventName.includes("proving grounds")) {
		return tournamentLogoUrl("pg");
	}

	if (normalizedEventName.includes("triton")) {
		return tournamentLogoUrl("tc");
	}

	if (normalizedEventName.includes("swim or sink")) {
		return tournamentLogoUrl("sos");
	}

	if (normalizedEventName.includes("from the ink up")) {
		return tournamentLogoUrl("ftiu");
	}

	if (normalizedEventName.includes("coral clash")) {
		return tournamentLogoUrl("cc");
	}

	if (normalizedEventName.includes("level up")) {
		return tournamentLogoUrl("lu");
	}

	if (normalizedEventName.includes("all 4 one")) {
		return tournamentLogoUrl("a41");
	}

	if (normalizedEventName.includes("fry basket")) {
		return tournamentLogoUrl("fb");
	}

	if (normalizedEventName.includes("the depths")) {
		return tournamentLogoUrl("d");
	}

	if (normalizedEventName.includes("eclipse")) {
		return tournamentLogoUrl("e");
	}

	if (normalizedEventName.includes("homecoming")) {
		return tournamentLogoUrl("hc");
	}

	if (normalizedEventName.includes("bad ideas")) {
		return tournamentLogoUrl("bio");
	}

	if (normalizedEventName.includes("tenoch")) {
		return tournamentLogoUrl("ai");
	}

	if (normalizedEventName.includes("megalodon monday")) {
		return tournamentLogoUrl("mm");
	}

	if (normalizedEventName.includes("heaven 2 ocean")) {
		return tournamentLogoUrl("ho");
	}

	if (normalizedEventName.includes("kraken royale")) {
		return tournamentLogoUrl("kr");
	}

	if (normalizedEventName.includes("menu royale")) {
		return tournamentLogoUrl("mr");
	}

	if (normalizedEventName.includes("barracuda co")) {
		return tournamentLogoUrl("bc");
	}

	if (normalizedEventName.includes("crimson ink")) {
		return tournamentLogoUrl("ci");
	}

	if (normalizedEventName.includes("mesozoic mayhem")) {
		return tournamentLogoUrl("me");
	}

	if (normalizedEventName.includes("rain or shine")) {
		return tournamentLogoUrl("ros");
	}

	if (normalizedEventName.includes("squid junction")) {
		return tournamentLogoUrl("sj");
	}

	if (normalizedEventName.includes("silly sausage")) {
		return tournamentLogoUrl("ss");
	}

	if (normalizedEventName.includes("united-lan")) {
		return tournamentLogoUrl("ul");
	}

	if (normalizedEventName.includes("soul cup")) {
		return tournamentLogoUrl("sc");
	}

	return tournamentLogoUrl("default");
}

export type CounterPickValidationStatus =
	| "PICKING"
	| "VALID"
	| "TOO_MUCH_STAGE_REPEAT"
	| "STAGE_REPEAT_IN_SAME_MODE"
	| "INCLUDES_BANNED"
	| "INCLUDES_TIEBREAKER";

export function validateCounterPickMapPool(
	mapPool: MapPool,
	isOneModeOnlyTournamentFor: ModeShort | null,
	tieBreakerMapPool: TournamentData["ctx"]["tieBreakerMapPool"],
): CounterPickValidationStatus {
	const stageCounts = new Map<StageId, number>();
	for (const stageId of mapPool.stages) {
		if (!stageCounts.has(stageId)) {
			stageCounts.set(stageId, 0);
		}

		if (
			stageCounts.get(stageId)! >= TOURNAMENT.COUNTERPICK_MAX_STAGE_REPEAT ||
			(isOneModeOnlyTournamentFor && stageCounts.get(stageId)! >= 1)
		) {
			return "TOO_MUCH_STAGE_REPEAT";
		}

		stageCounts.set(stageId, stageCounts.get(stageId)! + 1);
	}

	if (
		new MapPool(mapPool.serialized).stageModePairs.length !==
		mapPool.stageModePairs.length
	) {
		return "STAGE_REPEAT_IN_SAME_MODE";
	}

	if (
		mapPool.stageModePairs.some((pair) =>
			BANNED_MAPS[pair.mode].includes(pair.stageId),
		)
	) {
		return "INCLUDES_BANNED";
	}

	if (
		mapPool.stageModePairs.some((pair) =>
			tieBreakerMapPool.some(
				(stage) => stage.mode === pair.mode && stage.stageId === pair.stageId,
			),
		)
	) {
		return "INCLUDES_TIEBREAKER";
	}

	if (
		!isOneModeOnlyTournamentFor &&
		(mapPool.parsed.SZ.length !== TOURNAMENT.COUNTERPICK_MAPS_PER_MODE ||
			mapPool.parsed.TC.length !== TOURNAMENT.COUNTERPICK_MAPS_PER_MODE ||
			mapPool.parsed.RM.length !== TOURNAMENT.COUNTERPICK_MAPS_PER_MODE ||
			mapPool.parsed.CB.length !== TOURNAMENT.COUNTERPICK_MAPS_PER_MODE)
	) {
		return "PICKING";
	}

	if (
		isOneModeOnlyTournamentFor &&
		mapPool.parsed[isOneModeOnlyTournamentFor].length !==
			TOURNAMENT.COUNTERPICK_ONE_MODE_TOURNAMENT_MAPS_PER_MODE
	) {
		return "PICKING";
	}

	return "VALID";
}

export function tournamentIsRanked({
	isSetAsRanked,
	startTime,
	minMembersPerTeam,
}: { isSetAsRanked?: boolean; startTime: Date; minMembersPerTeam: number }) {
	const seasonIsActive = Boolean(currentSeason(startTime));
	if (!seasonIsActive) return false;

	// 1v1, 2v2 and 3v3 are always considered "gimmicky"
	if (minMembersPerTeam !== 4) return false;

	return isSetAsRanked ?? true;
}

export function resolveLeagueRoundStartDate(
	tournament: TournamentClass,
	roundId: number,
) {
	if (!tournament.isLeagueDivision) return null;

	const league = Object.values(LEAGUES)
		.flat()
		.find(
			(league) => league.tournamentId === tournament.ctx.parentTournamentId,
		);
	if (!league) return null;

	const bracket = tournament.brackets.find((b) =>
		b.data.round.some((r) => r.id === roundId),
	);

	const round = bracket?.data.round.find((r) => r.id === roundId);
	const onlyRelevantRounds = bracket?.data.round.filter(
		(r) => r.group_id === round?.group_id,
	);

	const roundIdx = onlyRelevantRounds?.findIndex((r) => r.id === roundId);
	if (roundIdx === undefined) return null;

	const week = league.weeks[roundIdx];
	if (!week) return null;

	const date = weekNumberToDate({
		week: week.weekNumber,
		year: week.year,
	});

	return date;
}

export function defaultBracketSettings(
	type: Tables["TournamentStage"]["type"],
): TournamentStageSettings {
	switch (type) {
		case "single_elimination": {
			return {
				thirdPlaceMatch: true,
			};
		}
		case "double_elimination": {
			return {};
		}
		case "round_robin": {
			return {
				teamsPerGroup: 4,
			};
		}
		case "swiss": {
			return {
				roundCount: 5,
				groupCount: 1,
			};
		}
		default: {
			assertUnreachable(type);
		}
	}
}

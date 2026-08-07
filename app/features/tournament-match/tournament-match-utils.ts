import type { TFunction } from "i18next";
import * as R from "remeda";
import type { WeaponPoolWeapon } from "~/components/match-page/WeaponPool";
import type { TournamentRoundMaps } from "~/db/tables-json";
import type { IngestedScoreboardPlayer } from "~/features/scanner-ingest/core/Scoreboards";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import type { TournamentDataTeam } from "~/features/tournament-bracket/core/Tournament.server";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type { TournamentMaplistSource } from "~/modules/tournament-map-list-generator/types";
import { logger } from "~/utils/logger";

export const tournamentMatchWebsocketRoom = (matchId: number) =>
	`match__${matchId}`;

export function resolveHostingTeam(
	teams: [TournamentDataTeam, TournamentDataTeam],
) {
	if (teams[0].prefersNotToHost && !teams[1].prefersNotToHost) return teams[1];
	if (!teams[0].prefersNotToHost && teams[1].prefersNotToHost) return teams[0];
	if (!teams[0].seed && !teams[1].seed) return teams[0];
	if (!teams[0].seed) return teams[1];
	if (!teams[1].seed) return teams[0];
	if (teams[0].seed < teams[1].seed) return teams[0];
	if (teams[1].seed < teams[0].seed) return teams[1];

	logger.error("resolveHostingTeam: unexpected default");
	return teams[0];
}

export function mapCountPlayedInSetWithCertainty({
	bestOf,
	scores,
}: {
	bestOf: number;
	scores: [number, number];
}) {
	const maxScore = Math.max(...scores);
	const scoreSum = R.sum(scores);

	return scoreSum + (Math.ceil(bestOf / 2) - maxScore);
}

export function matchIsLocked({
	tournament,
	matchId,
	scores,
}: {
	tournament: Tournament;
	matchId: number;
	scores: [number, number];
}) {
	if (scores[0] !== 0 || scores[1] !== 0) return false;

	const locked = tournament.ctx.castedMatchesInfo?.lockedMatches ?? [];

	return locked.some((lm) => lm.matchId === matchId);
}

export function pickInfoText({
	map,
	t,
	teams,
}: {
	map?: { stageId: StageId; mode: ModeShort; source: TournamentMaplistSource };
	t: TFunction<["tournament"]>;
	teams: [TournamentDataTeam, TournamentDataTeam];
}) {
	if (!map) return "";

	if (map.source === teams[0].id) {
		return t("tournament:pickInfo.team", { number: 1 });
	}
	if (map.source === teams[1].id) {
		return t("tournament:pickInfo.team", { number: 2 });
	}
	if (map.source === "TIEBREAKER") {
		return t("tournament:pickInfo.tiebreaker");
	}
	if (map.source === "BOTH") return t("tournament:pickInfo.both");
	if (map.source === "DEFAULT") return t("tournament:pickInfo.default");
	if (map.source === "COUNTERPICK") {
		return t("tournament:pickInfo.counterpick");
	}
	if (map.source === "ROLL") {
		return t("tournament:pickInfo.roll");
	}
	if (map.source === "TO") return "";

	logger.error(`Unknown source: ${String(map.source)}`);
	return "";
}

/**
 * One team's weapons for a map row: each roster member's reported weapon,
 * with the gaps filled from the map's ingested scoreboard rows that no
 * member accounts for. An ingested row without a user is only unaccounted
 * for if no roster member already reported its weapon, otherwise it is that
 * member's row and reusing it would show their weapon twice — a multiset
 * count, so two ingested rows of a weapon survive one report of it.
 *
 * @param linkedWeapons per roster member, the weapon they reported for the map (null = none)
 * @param ingestedPlayers the map's ingested scoreboard rows (empty when none ingested)
 * @returns index-aligned with `linkedWeapons`; ingested fills are marked unverified
 */
export function resolveTimelineWeapons({
	linkedWeapons,
	ingestedPlayers,
	tournamentTeamId,
}: {
	linkedWeapons: (MainWeaponId | null)[];
	ingestedPlayers: IngestedScoreboardPlayer[];
	tournamentTeamId: number;
}): WeaponPoolWeapon[] {
	const accountedForCounts = new Map<MainWeaponId, number>();
	for (const weapon of linkedWeapons) {
		if (weapon === null) continue;
		accountedForCounts.set(weapon, (accountedForCounts.get(weapon) ?? 0) + 1);
	}

	const unlinkedIngested = ingestedPlayers.flatMap((player) => {
		if (
			player.userId !== undefined ||
			player.weaponSplId === null ||
			player.tournamentTeamId !== tournamentTeamId
		) {
			return [];
		}

		const accountedFor = accountedForCounts.get(player.weaponSplId) ?? 0;
		if (accountedFor > 0) {
			accountedForCounts.set(player.weaponSplId, accountedFor - 1);
			return [];
		}

		return [player.weaponSplId];
	});

	let unlinkedIdx = 0;
	return linkedWeapons.map((linked) => {
		if (linked !== null) return linked;

		const ingested = unlinkedIngested[unlinkedIdx++];
		return ingested !== undefined
			? { weaponSplId: ingested, unverified: true }
			: null;
	});
}

export function isSetOverByResults({
	results,
	count,
	countType,
}: {
	results: Array<{ winnerTeamId: number }>;
	count: number;
	countType: TournamentRoundMaps["type"];
}) {
	const winCounts = R.countBy(results, (r) => r.winnerTeamId);

	if (countType === "PLAY_ALL") {
		return R.sum(Object.values(winCounts)) === count;
	}

	const maxWins = Math.max(...Object.values(winCounts));

	// best of
	return maxWins >= Math.ceil(count / 2);
}

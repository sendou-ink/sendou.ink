import type {
	IngestedScoreboardData,
	IngestedScoreboardPlayer,
} from "~/features/scanner-ingest/core/Scoreboards";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import type { ObjectiveTimelineEvent } from "../ObjectiveTimeline";
import type { PlayerStatusTimelineSample } from "../PlayerStatusTimeline";
import type { TimelineMap } from "./MatchTimeline";
import type { WeaponPoolWeapon } from "./WeaponPool";

/** Ingested scoreboard rows come winning team first, 4 players per side. */
const SCOREBOARD_PLAYERS_PER_TEAM = 4;

/**
 * Maps a game's ingested scoreboard (stored winner-first) onto the
 * alpha/bravo-oriented shape the match timeline renders.
 */
export function resolveTimelineScoreboard(
	data: IngestedScoreboardData | undefined,
	alphaIsWinner: boolean,
): TimelineMap["scoreboard"] {
	if (!data) return undefined;

	const toTimelinePlayers = (players: IngestedScoreboardData["players"]) =>
		players.map((player) => ({
			name: player.name,
			weaponSplId: player.weaponSplId,
			ka: player.ka,
			d: player.d,
			s: player.s,
			paint: player.paint,
			abilities: player.abilities,
		}));

	const winnerRows = data.players.slice(0, SCOREBOARD_PLAYERS_PER_TEAM);
	const loserRows = data.players.slice(SCOREBOARD_PLAYERS_PER_TEAM);
	const [winnerScore, loserScore] = data.scores;

	return {
		scores: alphaIsWinner
			? ([winnerScore, loserScore] as [number | null, number | null])
			: ([loserScore, winnerScore] as [number | null, number | null]),
		alpha: toTimelinePlayers(alphaIsWinner ? winnerRows : loserRows),
		bravo: toTimelinePlayers(alphaIsWinner ? loserRows : winnerRows),
		objective: toTimelineObjective(data.objective, alphaIsWinner),
		playerStatus: toTimelinePlayerStatus(data.playerStatus, alphaIsWinner),
	};
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
 * @param tournamentTeamId the team's side id in the game result (tournament team or SendouQ group id)
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

/** Stored counter samples are winner-first; the timeline charts alpha-first. */
function toTimelineObjective(
	objective: IngestedScoreboardData["objective"],
	alphaIsWinner: boolean,
): ObjectiveTimelineEvent[] | undefined {
	if (!objective) return undefined;

	const alphaFirst = <T>(pair: [T, T]): [T, T] =>
		alphaIsWinner ? pair : [pair[1], pair[0]];

	return objective.samples.map((sample) => ({
		t: sample.t,
		data: {
			time: sample.time,
			score: alphaFirst(sample.score),
			penalty: alphaFirst(sample.penalty),
			control: alphaFirst(sample.control),
		},
	}));
}

/** Stored status samples are winner-first; the timeline charts alpha-first. */
function toTimelinePlayerStatus(
	playerStatus: IngestedScoreboardData["playerStatus"],
	alphaIsWinner: boolean,
): PlayerStatusTimelineSample[] | undefined {
	if (!playerStatus) return undefined;

	const alphaFirst = <T>(pair: [T, T]): [T, T] =>
		alphaIsWinner ? pair : [pair[1], pair[0]];

	return playerStatus.samples.map((sample) => ({
		t: sample.t,
		special: alphaFirst(sample.special),
		dead: alphaFirst(sample.dead),
	}));
}

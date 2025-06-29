import { ordinal } from "openskill";
import * as R from "remeda";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "~/features/leaderboards/leaderboards-constants";
import {
	identifierToUserIds,
	ordinalToSp,
	rate,
	userIdsToIdentifier,
} from "~/features/mmr/mmr-utils";
import invariant from "~/utils/invariant";
import { roundToNDecimalPlaces } from "~/utils/number";
import type { Tables, WinLossParticipationArray } from "../../../db/tables";
import type { AllMatchResult } from "../queries/allMatchResultsByTournamentId.server";
import { ensureOneStandingPerUser } from "../tournament-bracket-utils";
import type { Standing } from "./Bracket";

export interface TournamentSummary {
	skills: Omit<
		Tables["Skill"],
		"tournamentId" | "id" | "ordinal" | "season" | "groupMatchId"
	>[];
	seedingSkills: Tables["SeedingSkill"][];
	mapResultDeltas: Omit<Tables["MapResult"], "season">[];
	playerResultDeltas: Omit<Tables["PlayerResult"], "season">[];
	tournamentResults: Omit<
		Tables["TournamentResult"],
		"tournamentId" | "isHighlight" | "spDiff" | "mapResults" | "setResults"
	>[];
	/** Map of user id to diff or null if not ranked event */
	spDiffs: Map<number, number> | null;
	/** Map of user id to map results */
	mapResults: Map<number, WinLossParticipationArray>;
	/** Map of user id to set results */
	setResults: Map<number, WinLossParticipationArray>;
}

type TeamsArg = Array<{
	id: number;
	members: Array<{ userId: number }>;
}>;

type Rating = Pick<Tables["Skill"], "mu" | "sigma">;
type RatingWithMatchesCount = {
	rating: Rating;
	matchesCount: number;
};

export function tournamentSummary({
	results,
	teams,
	finalStandings,
	queryCurrentTeamRating,
	queryTeamPlayerRatingAverage,
	queryCurrentUserRating,
	queryCurrentSeedingRating,
	seedingSkillCountsFor,
	calculateSeasonalStats = true,
}: {
	results: AllMatchResult[];
	teams: TeamsArg;
	finalStandings: Standing[];
	queryCurrentTeamRating: (identifier: string) => Rating;
	queryTeamPlayerRatingAverage: (identifier: string) => Rating;
	queryCurrentUserRating: (userId: number) => RatingWithMatchesCount;
	queryCurrentSeedingRating: (userId: number) => Rating;
	seedingSkillCountsFor: Tables["SeedingSkill"]["type"] | null;
	calculateSeasonalStats?: boolean;
}): TournamentSummary {
	const skills = calculateSeasonalStats
		? calculateSkills({
				results,
				queryCurrentTeamRating,
				queryCurrentUserRating,
				queryTeamPlayerRatingAverage,
			})
		: [];

	return {
		skills,
		seedingSkills: seedingSkillCountsFor
			? calculateIndividualPlayerSkills({
					queryCurrentUserRating: (userId) => ({
						rating: queryCurrentSeedingRating(userId),
						matchesCount: 0, // Seeding skills do not have matches count
					}),
					results,
				}).map((skill) => ({
					...skill,
					type: seedingSkillCountsFor,
					ordinal: ordinal(skill),
				}))
			: [],
		mapResultDeltas: calculateSeasonalStats ? mapResultDeltas(results) : [],
		playerResultDeltas: calculateSeasonalStats
			? playerResultDeltas(results)
			: [],
		tournamentResults: tournamentResults({
			participantCount: teams.length,
			finalStandings: ensureOneStandingPerUser(finalStandings),
		}),
		spDiffs: calculateSeasonalStats
			? spDiffs({ skills, queryCurrentUserRating })
			: null,
		...mapSetResults({ results, teams }),
	};
}

function calculateSkills(args: {
	results: AllMatchResult[];
	queryCurrentTeamRating: (identifier: string) => Rating;
	queryTeamPlayerRatingAverage: (identifier: string) => Rating;
	queryCurrentUserRating: (userId: number) => RatingWithMatchesCount;
}) {
	const result: TournamentSummary["skills"] = [];

	result.push(...calculateIndividualPlayerSkills(args));
	result.push(...calculateTeamSkills(args));

	return result;
}

export function calculateIndividualPlayerSkills({
	results,
	queryCurrentUserRating,
}: {
	results: AllMatchResult[];
	queryCurrentUserRating: (userId: number) => RatingWithMatchesCount;
}) {
	const userRatings = new Map<number, Rating>();
	const userMatchesCount = new Map<number, number>();
	const getUserRating = (userId: number) => {
		const existingRating = userRatings.get(userId);
		if (existingRating) return existingRating;

		return queryCurrentUserRating(userId).rating;
	};

	for (const match of results) {
		const { winnerUserIds, loserUserIds } = matchToSetMostPlayedUsers(match);

		const [ratedWinners, ratedLosers] = rate([
			winnerUserIds.map(getUserRating),
			loserUserIds.map(getUserRating),
		]);

		for (const [i, rating] of ratedWinners.entries()) {
			const userId = winnerUserIds[i];
			invariant(userId, "userId should exist");

			userRatings.set(userId, rating);
			userMatchesCount.set(userId, (userMatchesCount.get(userId) ?? 0) + 1);
		}

		for (const [i, rating] of ratedLosers.entries()) {
			const userId = loserUserIds[i];
			invariant(userId, "userId should exist");

			userRatings.set(userId, rating);
			userMatchesCount.set(userId, (userMatchesCount.get(userId) ?? 0) + 1);
		}
	}

	return Array.from(userRatings.entries()).map(([userId, rating]) => {
		const matchesCount = userMatchesCount.get(userId);
		invariant(matchesCount, "matchesCount should exist");

		return {
			mu: rating.mu,
			sigma: rating.sigma,
			userId,
			identifier: null,
			matchesCount,
		};
	});
}

/**
 * Determines the most frequently appearing user IDs for both the winning and losing teams in a match/set.
 *
 * For each team (winner and loser), this function collects all user IDs from the match's map participants,
 * counts their occurrences, and returns the most popular user IDs up to a full team's worth depending on the tournament format (4v4, 3v3 etc.).
 * If there are ties at the cutoff, all tied user IDs are included.
 */
function matchToSetMostPlayedUsers(match: AllMatchResult) {
	const resolveMostPopularUserIds = (userIds: number[]) => {
		const counts = userIds.reduce((acc, userId) => {
			acc.set(userId, (acc.get(userId) ?? 0) + 1);
			return acc;
		}, new Map<number, number>());

		const sorted = Array.from(counts.entries()).sort(
			([, countA], [, countB]) => countB - countA,
		);

		const targetAmount = Math.ceil(match.maps[0].participants.length / 2);

		const result: number[] = [];
		let previousCount = 0;
		for (const [userId, count] of sorted) {
			// take target amount of most popular users
			// or more if there are ties
			if (result.length >= targetAmount && count < previousCount) break;

			result.push(userId);
			previousCount = count;
		}

		return result;
	};

	const winnerTeamId =
		match.opponentOne.result === "win"
			? match.opponentOne.id
			: match.opponentTwo.id;
	const participants = match.maps.flatMap((m) => m.participants);
	const winnerUserIds = participants
		.filter((p) => p.tournamentTeamId === winnerTeamId)
		.map((p) => p.userId);
	const loserUserIds = participants
		.filter((p) => p.tournamentTeamId !== winnerTeamId)
		.map((p) => p.userId);

	return {
		winnerUserIds: resolveMostPopularUserIds(winnerUserIds),
		loserUserIds: resolveMostPopularUserIds(loserUserIds),
	};
}

function calculateTeamSkills({
	results,
	queryCurrentTeamRating,
	queryTeamPlayerRatingAverage,
}: {
	results: AllMatchResult[];
	queryCurrentTeamRating: (identifier: string) => Rating;
	queryTeamPlayerRatingAverage: (identifier: string) => Rating;
}) {
	const teamRatings = new Map<string, Rating>();
	const teamMatchesCount = new Map<string, number>();
	const getTeamRating = (identifier: string) => {
		const existingRating = teamRatings.get(identifier);
		if (existingRating) return existingRating;

		return queryCurrentTeamRating(identifier);
	};

	for (const match of results) {
		const winnerTeamId =
			match.opponentOne.result === "win"
				? match.opponentOne.id
				: match.opponentTwo.id;

		const winnerTeamIdentifiers = match.maps.flatMap((m) => {
			const winnerUserIds = m.participants
				.filter((p) => p.tournamentTeamId === winnerTeamId)
				.map((p) => p.userId);

			return userIdsToIdentifier(winnerUserIds);
		});
		const winnerTeamIdentifier = selectMostPopular(winnerTeamIdentifiers);

		const loserTeamIdentifiers = match.maps.flatMap((m) => {
			const loserUserIds = m.participants
				.filter((p) => p.tournamentTeamId !== winnerTeamId)
				.map((p) => p.userId);

			return userIdsToIdentifier(loserUserIds);
		});
		const loserTeamIdentifier = selectMostPopular(loserTeamIdentifiers);

		const [[ratedWinner], [ratedLoser]] = rate(
			[
				[getTeamRating(winnerTeamIdentifier)],
				[getTeamRating(loserTeamIdentifier)],
			],
			[
				[queryTeamPlayerRatingAverage(winnerTeamIdentifier)],
				[queryTeamPlayerRatingAverage(loserTeamIdentifier)],
			],
		);

		teamRatings.set(winnerTeamIdentifier, ratedWinner);
		teamRatings.set(loserTeamIdentifier, ratedLoser);

		teamMatchesCount.set(
			winnerTeamIdentifier,
			(teamMatchesCount.get(winnerTeamIdentifier) ?? 0) + 1,
		);
		teamMatchesCount.set(
			loserTeamIdentifier,
			(teamMatchesCount.get(loserTeamIdentifier) ?? 0) + 1,
		);
	}

	return Array.from(teamRatings.entries()).map(([identifier, rating]) => {
		const matchesCount = teamMatchesCount.get(identifier);
		invariant(matchesCount, "matchesCount should exist");

		return {
			mu: rating.mu,
			sigma: rating.sigma,
			userId: null,
			identifier,
			matchesCount,
		};
	});
}

function selectMostPopular<T>(items: T[]): T {
	const counts = new Map<T, number>();

	for (const item of items) {
		counts.set(item, (counts.get(item) ?? 0) + 1);
	}

	const sorted = Array.from(counts.entries()).sort(
		([, countA], [, countB]) => countB - countA,
	);

	const mostPopularCount = sorted[0][1];

	const mostPopularItems = sorted.filter(
		([, count]) => count === mostPopularCount,
	);

	if (mostPopularItems.length === 1) {
		return mostPopularItems[0][0];
	}

	return R.shuffle(mostPopularItems)[0][0];
}

function mapResultDeltas(
	results: AllMatchResult[],
): TournamentSummary["mapResultDeltas"] {
	const result: TournamentSummary["mapResultDeltas"] = [];

	const addMapResult = (
		mapResult: Pick<Tables["MapResult"], "stageId" | "mode" | "userId"> & {
			type: "win" | "loss";
		},
	) => {
		const existingResult = result.find(
			(r) =>
				r.userId === mapResult.userId &&
				r.stageId === mapResult.stageId &&
				r.mode === mapResult.mode,
		);

		if (existingResult) {
			existingResult[mapResult.type === "win" ? "wins" : "losses"] += 1;
		} else {
			result.push({
				userId: mapResult.userId,
				stageId: mapResult.stageId,
				mode: mapResult.mode,
				wins: mapResult.type === "win" ? 1 : 0,
				losses: mapResult.type === "loss" ? 1 : 0,
			});
		}
	};

	for (const match of results) {
		for (const map of match.maps) {
			for (const participant of map.participants) {
				addMapResult({
					mode: map.mode,
					stageId: map.stageId,
					type:
						participant.tournamentTeamId === map.winnerTeamId ? "win" : "loss",
					userId: participant.userId,
				});
			}
		}
	}

	return result;
}

function playerResultDeltas(
	results: AllMatchResult[],
): TournamentSummary["playerResultDeltas"] {
	const result: TournamentSummary["playerResultDeltas"] = [];

	const addPlayerResult = (
		playerResult: TournamentSummary["playerResultDeltas"][number],
	) => {
		const existingResult = result.find(
			(r) =>
				r.type === playerResult.type &&
				r.otherUserId === playerResult.otherUserId &&
				r.ownerUserId === playerResult.ownerUserId,
		);

		if (existingResult) {
			existingResult.mapLosses += playerResult.mapLosses;
			existingResult.mapWins += playerResult.mapWins;
			existingResult.setLosses += playerResult.setLosses;
			existingResult.setWins += playerResult.setWins;
		} else {
			result.push(playerResult);
		}
	};

	for (const match of results) {
		for (const map of match.maps) {
			for (const ownerParticipant of map.participants) {
				for (const otherParticipant of map.participants) {
					if (ownerParticipant.userId === otherParticipant.userId) continue;

					const won = ownerParticipant.tournamentTeamId === map.winnerTeamId;

					addPlayerResult({
						ownerUserId: ownerParticipant.userId,
						otherUserId: otherParticipant.userId,
						mapLosses: won ? 0 : 1,
						mapWins: won ? 1 : 0,
						setLosses: 0,
						setWins: 0,
						type:
							ownerParticipant.tournamentTeamId ===
							otherParticipant.tournamentTeamId
								? "MATE"
								: "ENEMY",
					});
				}
			}
		}

		const mostPopularParticipants = (() => {
			const alphaIdentifiers: string[] = [];
			const bravoIdentifiers: string[] = [];

			for (const map of match.maps) {
				const alphaUserIds = map.participants
					.filter(
						(participant) =>
							participant.tournamentTeamId === match.opponentOne.id,
					)
					.map((p) => p.userId);
				const bravoUserIds = map.participants
					.filter(
						(participant) =>
							participant.tournamentTeamId === match.opponentTwo.id,
					)
					.map((p) => p.userId);

				alphaIdentifiers.push(userIdsToIdentifier(alphaUserIds));
				bravoIdentifiers.push(userIdsToIdentifier(bravoUserIds));
			}

			const alphaIdentifier = selectMostPopular(alphaIdentifiers);
			const bravoIdentifier = selectMostPopular(bravoIdentifiers);

			return [
				...identifierToUserIds(alphaIdentifier).map((id) => ({
					userId: id,
					tournamentTeamId: match.opponentOne.id,
				})),
				...identifierToUserIds(bravoIdentifier).map((id) => ({
					userId: id,
					tournamentTeamId: match.opponentTwo.id,
				})),
			];
		})();

		for (const ownerParticipant of mostPopularParticipants) {
			for (const otherParticipant of mostPopularParticipants) {
				if (ownerParticipant.userId === otherParticipant.userId) continue;

				const result =
					match.opponentOne.id === ownerParticipant.tournamentTeamId
						? match.opponentOne.result
						: match.opponentTwo.result;
				const won = result === "win";

				addPlayerResult({
					ownerUserId: ownerParticipant.userId,
					otherUserId: otherParticipant.userId,
					mapLosses: 0,
					mapWins: 0,
					setLosses: won ? 0 : 1,
					setWins: won ? 1 : 0,
					type:
						ownerParticipant.tournamentTeamId ===
						otherParticipant.tournamentTeamId
							? "MATE"
							: "ENEMY",
				});
			}
		}
	}

	return result;
}

function tournamentResults({
	participantCount,
	finalStandings,
}: {
	participantCount: number;
	finalStandings: Standing[];
}) {
	const result: TournamentSummary["tournamentResults"] = [];

	for (const standing of finalStandings) {
		for (const player of standing.team.members) {
			result.push({
				participantCount,
				placement: standing.placement,
				tournamentTeamId: standing.team.id,
				userId: player.userId,
			});
		}
	}

	return result;
}

function spDiffs({
	skills,
	queryCurrentUserRating,
}: {
	skills: TournamentSummary["skills"];
	queryCurrentUserRating: (userId: number) => RatingWithMatchesCount;
}): TournamentSummary["spDiffs"] {
	const spDiffs = new Map<number, number>();

	for (const skill of skills) {
		if (skill.userId === null) continue;

		const oldRating = queryCurrentUserRating(skill.userId);

		// there should be no user visible sp diff if the user has less than
		// MATCHES_COUNT_NEEDED_FOR_LEADERBOARD matches played before because
		// the sp is not visible to user before that threshold
		if (oldRating.matchesCount < MATCHES_COUNT_NEEDED_FOR_LEADERBOARD) {
			continue;
		}

		const diff = roundToNDecimalPlaces(
			ordinalToSp(ordinal(skill)) - ordinalToSp(ordinal(oldRating.rating)),
		);

		spDiffs.set(skill.userId, diff);
	}

	return spDiffs;
}

export function mapSetResults({
	results,
	teams,
}: {
	results: AllMatchResult[];
	teams: TeamsArg;
}) {
	const mapResults = new Map<number, WinLossParticipationArray>();
	const setResults = new Map<number, WinLossParticipationArray>();

	const addTo = (
		where: "map" | "set",
		userId: number,
		result: WinLossParticipationArray[number],
	) => {
		const map = where === "map" ? mapResults : setResults;

		const existing = map.get(userId) ?? [];
		existing.push(result);

		map.set(userId, existing);
	};

	// xxx: handle setResults

	for (const match of results) {
		const allMatchUserIds = teams.flatMap((team) => {
			const didParticipateInTheMatch =
				match.opponentOne.id === team.id || match.opponentTwo.id === team.id;
			if (!didParticipateInTheMatch) return [];

			return userIdsFromTeamId(teams, team.id);
		});

		const { winnerUserIds, loserUserIds } = matchToSetMostPlayedUsers(match);
		const subbedOut = allMatchUserIds.filter(
			(userId) =>
				!winnerUserIds.some((wUserId) => wUserId === userId) &&
				!loserUserIds.some((lUserId) => lUserId === userId),
		);

		for (const winnerUserId of winnerUserIds) addTo("set", winnerUserId, "W");
		for (const loserUserId of loserUserIds) addTo("set", loserUserId, "L");
		for (const subUserId of subbedOut) addTo("set", subUserId, null);

		for (const map of match.maps) {
			const winners = map.participants.filter(
				(p) => p.tournamentTeamId === map.winnerTeamId,
			);
			const losers = map.participants.filter(
				(p) => p.tournamentTeamId !== map.winnerTeamId,
			);
			const subbedOut = allMatchUserIds.filter(
				(userId) =>
					!winners.some((p) => p.userId === userId) &&
					!losers.some((p) => p.userId === userId),
			);

			for (const winner of winners) addTo("map", winner.userId, "W");
			for (const loser of losers) addTo("map", loser.userId, "L");
			for (const subUserId of subbedOut) addTo("map", subUserId, null);
		}
	}

	return {
		mapResults,
		setResults,
	};
}

function userIdsFromTeamId(teams: TeamsArg, teamId: number) {
	const team = teams.find((t) => t.id === teamId);
	invariant(team, `Team with id ${teamId} not found`);

	return team.members.map((m) => m.userId);
}

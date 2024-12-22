import shuffle from "just-shuffle";
import type { Rating } from "node_modules/openskill/dist/types";
import { ordinal } from "openskill";
import type {
	MapResult,
	PlayerResult,
	Skill,
	TournamentResult,
} from "~/db/types";
import {
	identifierToUserIds,
	rate,
	userIdsToIdentifier,
} from "~/features/mmr/mmr-utils";
import { removeDuplicates } from "~/utils/arrays";
import invariant from "~/utils/invariant";
import type { Tables } from "../../../db/tables";
import type { AllMatchResult } from "../queries/allMatchResultsByTournamentId.server";
import { ensureOneStandingPerUser } from "../tournament-bracket-utils";
import type { Standing } from "./Bracket";

export interface TournamentSummary {
	skills: Omit<
		Skill,
		"tournamentId" | "id" | "ordinal" | "season" | "groupMatchId"
	>[];
	seedingSkills: Tables["SeedingSkill"][];
	mapResultDeltas: Omit<MapResult, "season">[];
	playerResultDeltas: Omit<PlayerResult, "season">[];
	tournamentResults: Omit<TournamentResult, "tournamentId" | "isHighlight">[];
}

type UserIdToTeamId = Record<number, number>;

type TeamsArg = Array<{
	id: number;
	members: Array<{ userId: number }>;
}>;

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
	queryCurrentUserRating: (userId: number) => Rating;
	queryCurrentSeedingRating: (userId: number) => Rating;
	seedingSkillCountsFor: Tables["SeedingSkill"]["type"] | null;
	calculateSeasonalStats?: boolean;
}): TournamentSummary {
	return {
		skills: calculateSeasonalStats
			? skills({
					results,
					queryCurrentTeamRating,
					queryCurrentUserRating,
					queryTeamPlayerRatingAverage,
				})
			: [],
		seedingSkills: seedingSkillCountsFor
			? calculateIndividualPlayerSkills({
					queryCurrentUserRating: queryCurrentSeedingRating,
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
	};
}

export function userIdsToTeamIdRecord(teams: TeamsArg) {
	const result: UserIdToTeamId = {};

	for (const team of teams) {
		for (const member of team.members) {
			result[member.userId] = team.id;
		}
	}

	return result;
}

function skills(args: {
	results: AllMatchResult[];
	queryCurrentTeamRating: (identifier: string) => Rating;
	queryTeamPlayerRatingAverage: (identifier: string) => Rating;
	queryCurrentUserRating: (userId: number) => Rating;
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
	queryCurrentUserRating: (userId: number) => Rating;
}) {
	const userRatings = new Map<number, Rating>();
	const userMatchesCount = new Map<number, number>();
	const getUserRating = (userId: number) => {
		const existingRating = userRatings.get(userId);
		if (existingRating) return existingRating;

		return queryCurrentUserRating(userId);
	};

	for (const match of results) {
		const winnerTeamId =
			match.opponentOne.result === "win"
				? match.opponentOne.id
				: match.opponentTwo.id;

		const participants = match.maps.flatMap((m) => m.participants);
		const winnerUserIds = removeDuplicates(
			participants
				.filter((p) => p.tournamentTeamId === winnerTeamId)
				.map((p) => p.userId),
		);
		const loserUserIds = removeDuplicates(
			participants
				.filter((p) => p.tournamentTeamId !== winnerTeamId)
				.map((p) => p.userId),
		);

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

	return shuffle(mostPopularItems)[0][0];
}

function mapResultDeltas(
	results: AllMatchResult[],
): TournamentSummary["mapResultDeltas"] {
	const result: TournamentSummary["mapResultDeltas"] = [];

	const addMapResult = (
		mapResult: Pick<MapResult, "stageId" | "mode" | "userId"> & {
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

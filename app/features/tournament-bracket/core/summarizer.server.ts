import { ordinal } from "openskill";
import * as R from "remeda";
import type { WinLossParticipationArray } from "~/db/tables-json";
import {
	identifierToUserIds,
	rate,
	type SkillTeamIdentifier,
	userIdsToIdentifier,
} from "~/features/mmr/mmr-utils";
import { getBracketProgressionLabel } from "~/features/tournament/tournament-utils";
import type { AllMatchResult } from "~/features/tournament-match/TournamentMatchRepository.server";
import invariant from "~/utils/invariant";
import type { Tables } from "../../../db/tables";
import { ensureOneStandingPerUser } from "../tournament-bracket-utils";
import type { Standing } from "./Bracket";
import { matchEndedEarly } from "./engine";
import type { ParsedBracket } from "./Progression";
import * as Progression from "./Progression";

export interface TournamentSummary {
	skills: Omit<
		Tables["Skill"],
		"tournamentId" | "id" | "ordinal" | "season" | "groupMatchId" | "createdAt"
	>[];
	seedingSkills: Tables["SeedingSkill"][];
	mapResultDeltas: Omit<Tables["MapResult"], "season">[];
	playerResultDeltas: Omit<Tables["PlayerResult"], "season">[];
	tournamentResults: Omit<
		Tables["TournamentResult"],
		"tournamentId" | "isHighlight" | "mapResults" | "setResults"
	>[];
	/** Map of user id to set results */
	setResults: Map<number, WinLossParticipationArray>;
}

type TeamsArg = Array<{
	id: number;
	memberUserIds: number[];
	startingBracketIdx?: number | null;
	abDivision?: number | null;
}>;

type Rating = Pick<Tables["Skill"], "mu" | "sigma">;
type RatingWithMatchesCount = {
	rating: Rating;
	matchesCount: number;
};

/**
 * Users and teams whose current ratings `tournamentSummary` may look up, for the caller to
 * load up front.
 *
 * A superset: which of a set's teams and players actually get looked up depends on who
 * played the most maps of the set, and ties there are broken at random. Enumerating every
 * candidate keeps that decision inside `tournamentSummary`.
 */
export function summaryRatingTargets(results: AllMatchResult[]) {
	const userIds = new Set<number>();
	const identifiers = new Set<SkillTeamIdentifier>();

	const addIdentifier = (teamUserIds: number[]) => {
		// non-full teams never make it as far as being looked up (`userIdsToIdentifier` throws)
		if (teamUserIds.length !== 4) return;

		identifiers.add(userIdsToIdentifier(teamUserIds));
	};

	for (const match of results) {
		const winner =
			match.winnerSide === "opponent1" ? match.opponentOne : match.opponentTwo;
		const loser =
			match.winnerSide === "opponent1" ? match.opponentTwo : match.opponentOne;

		if (match.maps.length === 0) {
			for (const opponent of [winner, loser]) {
				const roster =
					opponent.activeRosterUserIds ?? opponent.memberUserIds ?? [];

				for (const userId of roster) userIds.add(userId);
				addIdentifier(roster);
			}
			continue;
		}

		for (const map of match.maps) {
			for (const participant of map.participants)
				userIds.add(participant.userId);

			addIdentifier(
				map.participants
					.filter((p) => p.tournamentTeamId === winner.id)
					.map((p) => p.userId),
			);
			addIdentifier(
				map.participants
					.filter((p) => p.tournamentTeamId !== winner.id)
					.map((p) => p.userId),
			);
		}
	}

	return {
		userIds: Array.from(userIds),
		identifiers: Array.from(identifiers),
	};
}

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
	progression,
}: {
	results: AllMatchResult[];
	teams: TeamsArg;
	finalStandings: Standing[];
	queryCurrentTeamRating: (identifier: SkillTeamIdentifier) => Rating;
	queryTeamPlayerRatingAverage: (identifier: SkillTeamIdentifier) => Rating;
	queryCurrentUserRating: (userId: number) => RatingWithMatchesCount;
	queryCurrentSeedingRating: (userId: number) => Rating;
	seedingSkillCountsFor: Tables["SeedingSkill"]["type"] | null;
	calculateSeasonalStats?: boolean;
	progression: ParsedBracket[];
}): TournamentSummary {
	const resultsWithoutEarlyEndedSets = results.filter((match) => {
		const endedEarly = matchEndedEarly({
			opponentOne: match.opponentOne,
			opponentTwo: match.opponentTwo,
			winnerSide: match.winnerSide,
			count: match.roundMaps.count,
			countType: match.roundMaps.type,
		});

		if (!endedEarly) return true;

		// Include early-ended sets where a team dropped out (they still affect skills)
		return match.opponentOne.droppedOut || match.opponentTwo.droppedOut;
	});

	const skills = calculateSeasonalStats
		? calculateSkills({
				results: resultsWithoutEarlyEndedSets,
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
					results: resultsWithoutEarlyEndedSets,
				}).map((skill) => ({
					...skill,
					type: seedingSkillCountsFor,
					ordinal: ordinal(skill),
				}))
			: [],
		mapResultDeltas: calculateSeasonalStats
			? mapResultDeltas(resultsWithoutEarlyEndedSets)
			: [],
		playerResultDeltas: calculateSeasonalStats
			? playerResultDeltas(resultsWithoutEarlyEndedSets)
			: [],
		tournamentResults: tournamentResults({
			participantCount: teams.length,
			finalStandings: ensureOneStandingPerUser(finalStandings),
			teams,
			progression,
		}),
		setResults: setResults({ results, teams }),
	};
}

function calculateSkills(args: {
	results: AllMatchResult[];
	queryCurrentTeamRating: (identifier: SkillTeamIdentifier) => Rating;
	queryTeamPlayerRatingAverage: (identifier: SkillTeamIdentifier) => Rating;
	queryCurrentUserRating: (userId: number) => RatingWithMatchesCount;
}) {
	const result: TournamentSummary["skills"] = [];

	result.push(...calculateIndividualPlayerSkills(args));
	result.push(...calculateTeamSkills(args));

	return result;
}

function calculateIndividualPlayerSkills({
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
 *
 * For dropped team sets without game results, uses the activeRosterUserIds from the team records.
 */
function matchToSetMostPlayedUsers(match: AllMatchResult) {
	const winner =
		match.winnerSide === "opponent1" ? match.opponentOne : match.opponentTwo;
	const loser =
		match.winnerSide === "opponent1" ? match.opponentTwo : match.opponentOne;

	// Handle dropped team sets without game results - use active roster or member list
	if (match.maps.length === 0) {
		const winnerRoster =
			winner.activeRosterUserIds ?? winner.memberUserIds ?? [];
		const loserRoster = loser.activeRosterUserIds ?? loser.memberUserIds ?? [];

		return {
			winnerUserIds: winnerRoster,
			loserUserIds: loserRoster,
		};
	}

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

	const participants = match.maps.flatMap((m) => m.participants);
	const winnerUserIds = participants
		.filter((p) => p.tournamentTeamId === winner.id)
		.map((p) => p.userId);
	const loserUserIds = participants
		.filter((p) => p.tournamentTeamId !== winner.id)
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
	queryCurrentTeamRating: (identifier: SkillTeamIdentifier) => Rating;
	queryTeamPlayerRatingAverage: (identifier: SkillTeamIdentifier) => Rating;
}) {
	const teamRatings = new Map<SkillTeamIdentifier, Rating>();
	const teamMatchesCount = new Map<SkillTeamIdentifier, number>();
	const getTeamRating = (identifier: SkillTeamIdentifier) => {
		const existingRating = teamRatings.get(identifier);
		if (existingRating) return existingRating;

		return queryCurrentTeamRating(identifier);
	};

	for (const match of results) {
		const winner =
			match.winnerSide === "opponent1" ? match.opponentOne : match.opponentTwo;
		const loser =
			match.winnerSide === "opponent1" ? match.opponentTwo : match.opponentOne;

		// Handle dropped team sets without game results - use active roster or member list
		let winnerTeamIdentifier: SkillTeamIdentifier;
		let loserTeamIdentifier: SkillTeamIdentifier;

		if (match.maps.length === 0) {
			// Use activeRosterUserIds if set, otherwise fall back to memberUserIds
			// (teams without subs have their roster trivially inferred from members)
			const winnerRoster =
				winner.activeRosterUserIds ?? winner.memberUserIds ?? [];
			const loserRoster =
				loser.activeRosterUserIds ?? loser.memberUserIds ?? [];

			// team identifiers require a full roster of 4; summaryRatingTargets
			// skips these rosters too so their ratings are never loaded
			if (winnerRoster.length !== 4 || loserRoster.length !== 4) continue;

			winnerTeamIdentifier = userIdsToIdentifier(winnerRoster);
			loserTeamIdentifier = userIdsToIdentifier(loserRoster);
		} else {
			const winnerTeamIdentifiers = match.maps.flatMap((m) => {
				const winnerUserIds = m.participants
					.filter((p) => p.tournamentTeamId === winner.id)
					.map((p) => p.userId);

				return userIdsToIdentifier(winnerUserIds);
			});
			winnerTeamIdentifier = selectMostPopular(winnerTeamIdentifiers);

			const loserTeamIdentifiers = match.maps.flatMap((m) => {
				const loserUserIds = m.participants
					.filter((p) => p.tournamentTeamId !== winner.id)
					.map((p) => p.userId);

				return userIdsToIdentifier(loserUserIds);
			});
			loserTeamIdentifier = selectMostPopular(loserTeamIdentifiers);
		}

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

		// Skip sets with no maps (ended early)
		if (match.maps.length === 0) {
			continue;
		}

		const mostPopularParticipants = (() => {
			const alphaIdentifiers: SkillTeamIdentifier[] = [];
			const bravoIdentifiers: SkillTeamIdentifier[] = [];

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

				const ownerSide =
					match.opponentOne.id === ownerParticipant.tournamentTeamId
						? "opponent1"
						: "opponent2";
				const won = match.winnerSide === ownerSide;

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
	teams,
	progression,
}: {
	participantCount: number;
	finalStandings: Standing[];
	teams: TeamsArg;
	progression: ParsedBracket[];
}) {
	const result: TournamentSummary["tournamentResults"] = [];

	const isMultiStartingBracket =
		Progression.startingBrackets(progression).length > 1;
	const isAbDivisionsFinals = Progression.hasAbDivisionsFinals(progression);

	for (const standing of finalStandings) {
		const team = teams.find((t) => t.id === standing.team.id);
		invariant(team);

		let div: string | null = null;
		let divisionParticipantCount = participantCount;

		if (isAbDivisionsFinals && typeof team.abDivision === "number") {
			div = team.abDivision === 0 ? "A" : "B";
			divisionParticipantCount = teams.filter(
				(t) => t.abDivision === team.abDivision,
			).length;
		} else if (
			isMultiStartingBracket &&
			typeof team.startingBracketIdx === "number"
		) {
			div = getBracketProgressionLabel(team.startingBracketIdx, progression);
			divisionParticipantCount = teams.filter(
				(t) => t.startingBracketIdx === team.startingBracketIdx,
			).length;
		}

		for (const userId of standing.team.memberUserIds) {
			result.push({
				participantCount: divisionParticipantCount,
				placement: standing.placement,
				tournamentTeamId: standing.team.id,
				userId,
				div,
			});
		}
	}

	return result;
}

function setResults({
	results,
	teams,
}: {
	results: AllMatchResult[];
	teams: TeamsArg;
}) {
	const setResults = new Map<number, WinLossParticipationArray>();

	const addToMap = (
		userId: number,
		result: WinLossParticipationArray[number],
	) => {
		const existing = setResults.get(userId) ?? [];
		existing.push(result);

		setResults.set(userId, existing);
	};

	for (const match of results) {
		const allMatchUserIds = teams.flatMap((team) => {
			const didParticipateInTheMatch =
				match.opponentOne.id === team.id || match.opponentTwo.id === team.id;
			if (!didParticipateInTheMatch) return [];

			return teamIdToMembersUserIds(teams, team.id);
		});

		const { winnerUserIds, loserUserIds } = matchToSetMostPlayedUsers(match);
		const subbedOut = allMatchUserIds.filter(
			(userId) =>
				!winnerUserIds.some((wUserId) => wUserId === userId) &&
				!loserUserIds.some((lUserId) => lUserId === userId),
		);

		for (const winnerUserId of winnerUserIds) addToMap(winnerUserId, "W");
		for (const loserUserId of loserUserIds) addToMap(loserUserId, "L");
		for (const subUserId of subbedOut) addToMap(subUserId, null);
	}

	return setResults;
}

function teamIdToMembersUserIds(teams: TeamsArg, teamId: number) {
	const team = teams.find((t) => t.id === teamId);
	invariant(team, `Team with id ${teamId} not found`);

	return team.memberUserIds;
}

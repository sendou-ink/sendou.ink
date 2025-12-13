import * as R from "remeda";
import type { Tables } from "~/db/tables";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import type { TournamentManagerDataSet } from "~/modules/brackets-manager/types";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import { cutToNDecimalPlaces } from "../../../../utils/number";
import { calculateTeamStatus } from "../Swiss";
import type { BracketMapCounts } from "../toMapList";
import { Bracket, type Standing, type TeamTrackRecord } from "./Bracket";

export class SwissBracket extends Bracket {
	get collectResultsWithPoints() {
		return false;
	}

	source({
		placements,
		advanceThreshold,
	}: {
		placements: number[];
		advanceThreshold?: number;
	}): {
		relevantMatchesFinished: boolean;
		teams: number[];
	} {
		invariant(
			advanceThreshold || placements.length > 0,
			"Placements or advanceThreshold required",
		);
		if (placements.some((p) => p < 0)) {
			throw new Error("Negative placements not implemented");
		}
		const standings = this.standings;

		const relevantMatchesFinished = this.data.round.every((round) => {
			const roundsMatches = this.data.match.filter(
				(match) => match.round_id === round.id,
			);

			// some round has not started yet
			if (roundsMatches.length === 0) return false;

			return roundsMatches.every((match) => {
				if (
					match.opponent1 &&
					match.opponent2 &&
					match.opponent1?.result !== "win" &&
					match.opponent2?.result !== "win"
				) {
					return false;
				}

				return true;
			});
		});

		if (advanceThreshold) {
			return {
				relevantMatchesFinished,
				teams: standings
					.map((standing) => ({
						...standing,
						status: calculateTeamStatus({
							advanceThreshold,
							wins: standing.stats?.setWins ?? 0,
							losses: standing.stats?.setLosses ?? 0,
							roundCount:
								this.settings?.roundCount ??
								TOURNAMENT.SWISS_DEFAULT_ROUND_COUNT,
						}),
					}))
					.filter((t) => t.status === "advanced")
					.map((t) => t.team.id),
			};
		}

		// Standard Swiss logic without early advance/elimination
		const uniquePlacements = R.unique(standings.map((s) => s.placement));

		// 1,3,5 -> 1,2,3 e.g.
		const placementNormalized = (p: number) => {
			return uniquePlacements.indexOf(p) + 1;
		};

		return {
			relevantMatchesFinished,
			teams: standings
				.filter((s) => placements.includes(placementNormalized(s.placement)))
				.map((s) => s.team.id),
		};
	}

	get standings(): Standing[] {
		return this.currentStandings();
	}

	currentStandings(includeUnfinishedGroups = false) {
		const groupIds = this.data.group.map((group) => group.id);

		const placements: (Standing & { groupId: number })[] = [];
		for (const groupId of groupIds) {
			const matches = this.data.match.filter(
				(match) => match.group_id === groupId,
			);

			const groupIsFinished = matches.every(
				(match) =>
					// BYE
					match.opponent1 === null ||
					match.opponent2 === null ||
					// match was played out
					match.opponent1?.result === "win" ||
					match.opponent2?.result === "win",
			);

			if (!groupIsFinished && !includeUnfinishedGroups) continue;

			const teams: {
				id: number;
				setWins: number;
				setLosses: number;
				mapWins: number;
				mapLosses: number;
				winsAgainstTied: number;
				lossesAgainstTied: number;
				opponentSets: TeamTrackRecord;
				opponentMaps: TeamTrackRecord;
			}[] = [];

			const updateTeam = ({
				teamId,
				setWins = 0,
				setLosses = 0,
				mapWins = 0,
				mapLosses = 0,
				opponentSets = { wins: 0, losses: 0 },
				opponentMaps = { wins: 0, losses: 0 },
			}: {
				teamId: number;
				setWins?: number;
				setLosses?: number;
				mapWins?: number;
				mapLosses?: number;
				opponentSets?: TeamTrackRecord;
				opponentMaps?: TeamTrackRecord;
			}) => {
				const team = teams.find((team) => team.id === teamId);
				if (team) {
					team.setWins += setWins;
					team.setLosses += setLosses;
					team.mapWins += mapWins;
					team.mapLosses += mapLosses;

					team.opponentSets.wins += opponentSets.wins;
					team.opponentSets.losses += opponentSets.losses;
					team.opponentMaps.wins += opponentMaps.wins;
					team.opponentMaps.losses += opponentMaps.losses;
				} else {
					teams.push({
						id: teamId,
						setWins,
						setLosses,
						mapWins,
						mapLosses,
						winsAgainstTied: 0,
						lossesAgainstTied: 0,
						opponentMaps,
						opponentSets,
					});
				}
			};

			const matchUps = new Map<number, number[]>();

			for (const match of matches) {
				if (match.opponent1?.id && match.opponent2?.id) {
					const opponentOneMatchUps = matchUps.get(match.opponent1.id) ?? [];
					const opponentTwoMatchUps = matchUps.get(match.opponent2.id) ?? [];

					matchUps.set(match.opponent1.id, [
						...opponentOneMatchUps,
						match.opponent2.id,
					]);
					matchUps.set(match.opponent2.id, [
						...opponentTwoMatchUps,
						match.opponent1.id,
					]);
				}

				if (
					match.opponent1?.result !== "win" &&
					match.opponent2?.result !== "win"
				) {
					continue;
				}

				const winner =
					match.opponent1?.result === "win" ? match.opponent1 : match.opponent2;

				const loser =
					match.opponent1?.result === "win" ? match.opponent2 : match.opponent1;

				if (!winner || !loser) continue;

				invariant(
					typeof winner.id === "number" &&
						typeof loser.id === "number" &&
						typeof winner.score === "number" &&
						typeof loser.score === "number",
					"RoundRobinBracket.standings: winner or loser id not found",
				);

				updateTeam({
					teamId: winner.id,
					setWins: 1,
					setLosses: 0,
					mapWins: winner.score,
					mapLosses: loser.score,
				});
				updateTeam({
					teamId: loser.id,
					setWins: 0,
					setLosses: 1,
					mapWins: loser.score,
					mapLosses: winner.score,
				});
			}

			// BYES
			for (const match of matches) {
				if (match.opponent1 && match.opponent2) {
					continue;
				}

				const winner = match.opponent1 ? match.opponent1 : match.opponent2;

				if (!winner?.id) {
					logger.warn("SwissBracket.currentStandings: winner not found");
					continue;
				}

				const round = this.data.round.find(
					(round) => round.id === match.round_id,
				);
				const mapWins =
					round?.maps?.type === "PLAY_ALL"
						? round?.maps?.count
						: Math.ceil((round?.maps?.count ?? 0) / 2);
				// preview
				if (!mapWins) {
					continue;
				}

				updateTeam({
					teamId: winner.id,
					setWins: 1,
					setLosses: 0,
					mapWins: mapWins,
					mapLosses: 0,
				});
			}

			// opponent win %
			for (const team of teams) {
				const teamsWhoPlayedAgainst = matchUps.get(team.id) ?? [];

				const opponentSets = {
					wins: 0,
					losses: 0,
				};
				const opponentMaps = {
					wins: 0,
					losses: 0,
				};

				for (const teamId of teamsWhoPlayedAgainst) {
					const opponent = teams.find((t) => t.id === teamId);
					if (!opponent) {
						logger.warn("SwissBracket.currentStandings: opponent not found", {
							teamId,
						});
						continue;
					}

					opponentSets.wins += opponent.setWins;
					opponentSets.losses += opponent.setLosses;

					opponentMaps.wins += opponent.mapWins;
					opponentMaps.losses += opponent.mapLosses;
				}

				updateTeam({
					teamId: team.id,
					opponentSets,
					opponentMaps,
				});
			}

			// wins against tied
			for (const team of teams) {
				for (const team2 of teams) {
					if (team.id === team2.id) continue;
					if (
						team.setWins !== team2.setWins ||
						// check also set losses to account for dropped teams
						team.setLosses !== team2.setLosses
					) {
						continue;
					}

					// they are different teams and are tied, let's check who won

					const finishedMatchBetweenTeams = matches.find((match) => {
						const isBetweenTeams =
							(match.opponent1?.id === team.id &&
								match.opponent2?.id === team2.id) ||
							(match.opponent1?.id === team2.id &&
								match.opponent2?.id === team.id);

						const isFinished =
							match.opponent1?.result === "win" ||
							match.opponent2?.result === "win";

						return isBetweenTeams && isFinished;
					});

					// they did not play each other
					if (!finishedMatchBetweenTeams) continue;

					const wonTheirMatch =
						(finishedMatchBetweenTeams.opponent1!.id === team.id &&
							finishedMatchBetweenTeams.opponent1!.result === "win") ||
						(finishedMatchBetweenTeams.opponent2!.id === team.id &&
							finishedMatchBetweenTeams.opponent2!.result === "win");

					if (wonTheirMatch) {
						team.winsAgainstTied++;
					} else {
						team.lossesAgainstTied++;
					}
				}
			}

			const droppedOutTeams = this.tournament.ctx.teams
				.filter((t) => t.droppedOut)
				.map((t) => t.id);
			placements.push(
				...teams
					.sort((a, b) => {
						// TIEBREAKER 0) dropped out teams are always last
						const aDroppedOut = droppedOutTeams.includes(a.id);
						const bDroppedOut = droppedOutTeams.includes(b.id);

						if (aDroppedOut && !bDroppedOut) return 1;
						if (!aDroppedOut && bDroppedOut) return -1;

						// TIEBREAKER 1) set wins
						if (a.setWins > b.setWins) return -1;
						if (a.setWins < b.setWins) return 1;

						// also set losses because we want a team who dropped more sets ranked lower (early advance format)
						if (a.setLosses < b.setLosses) return -1;
						if (a.setLosses > b.setLosses) return 1;

						// TIEBREAKER 2) wins against tied - ensure that a team who beat more teams that are tied with them is placed higher
						if (a.lossesAgainstTied > b.lossesAgainstTied) return 1;
						if (a.lossesAgainstTied < b.lossesAgainstTied) return -1;

						// TIEBREAKER 3) opponent set win % - how good the opponents they played against were?
						const aOpponentSetWinPercentage = this.trackRecordToWinPercentage(
							a.opponentSets,
						);
						const bOpponentSetWinPercentage = this.trackRecordToWinPercentage(
							b.opponentSets,
						);

						if (aOpponentSetWinPercentage > bOpponentSetWinPercentage) {
							return -1;
						}
						if (aOpponentSetWinPercentage < bOpponentSetWinPercentage) return 1;

						// TIEBREAKER 4) map wins
						if (a.mapWins > b.mapWins) return -1;
						if (a.mapWins < b.mapWins) return 1;

						// also map losses because we want a team who dropped more maps ranked lower
						if (a.mapLosses < b.mapLosses) return -1;
						if (a.mapLosses > b.mapLosses) return 1;

						// TIEBREAKER 5) map wins against tied OW% (M) - note that this needs to be lower than map wins tiebreaker to make sure that throwing maps is not optimal
						const aOpponentMapWinPercentage = this.trackRecordToWinPercentage(
							a.opponentMaps,
						);
						const bOpponentMapWinPercentage = this.trackRecordToWinPercentage(
							b.opponentMaps,
						);

						if (aOpponentMapWinPercentage > bOpponentMapWinPercentage) {
							return -1;
						}
						if (aOpponentMapWinPercentage < bOpponentMapWinPercentage) return 1;

						// TIEBREAKER 6) initial seeding made by the TO
						const aSeed = Number(this.tournament.teamById(a.id)?.seed);
						const bSeed = Number(this.tournament.teamById(b.id)?.seed);

						if (aSeed < bSeed) return -1;
						if (aSeed > bSeed) return 1;

						return 0;
					})
					.map((team, i) => {
						return {
							team: this.tournament.teamById(team.id)!,
							placement: i + 1,
							groupId,
							stats: {
								setWins: team.setWins,
								setLosses: team.setLosses,
								mapWins: team.mapWins,
								mapLosses: team.mapLosses,
								winsAgainstTied: team.winsAgainstTied,
								lossesAgainstTied: team.lossesAgainstTied,
								opponentSetWinPercentage: this.trackRecordToWinPercentage(
									team.opponentSets,
								),
								opponentMapWinPercentage: this.trackRecordToWinPercentage(
									team.opponentMaps,
								),
								points: 0,
							},
						};
					}),
			);
		}

		const sorted = placements.sort((a, b) => {
			if (a.placement < b.placement) return -1;
			if (a.placement > b.placement) return 1;

			if (a.groupId < b.groupId) return -1;
			if (a.groupId > b.groupId) return 1;

			return 0;
		});

		let lastPlacement = 0;
		let currentPlacement = 1;
		let teamsEncountered = 0;
		return this.standingsWithoutNonParticipants(
			sorted.map((team) => {
				if (team.placement !== lastPlacement) {
					lastPlacement = team.placement;
					currentPlacement = teamsEncountered + 1;
				}
				teamsEncountered++;
				return {
					...team,
					placement: currentPlacement,
					stats: team.stats,
				};
			}),
		);
	}

	private trackRecordToWinPercentage(trackRecord: TeamTrackRecord) {
		const onlyByes = trackRecord.wins === 0 && trackRecord.losses === 0;
		if (onlyByes) {
			return 0;
		}

		return cutToNDecimalPlaces(
			(trackRecord.wins / (trackRecord.wins + trackRecord.losses)) * 100,
			2,
		);
	}

	get type(): Tables["TournamentStage"]["type"] {
		return "swiss";
	}

	defaultRoundBestOfs(data: TournamentManagerDataSet) {
		const result: BracketMapCounts = new Map();

		for (const round of data.round) {
			if (!result.get(round.group_id)) {
				result.set(round.group_id, new Map());
			}

			result
				.get(round.group_id)!
				.set(round.number, { count: 3, type: "BEST_OF" });
		}

		return result;
	}

	ongoingMatches(): number[] {
		// Swiss matches get startedAt at creation time, not via ongoing detection
		return [];
	}
}

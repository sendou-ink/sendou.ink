import * as R from "remeda";
import type { Tables } from "~/db/tables";
import type { TournamentManagerDataSet } from "~/modules/brackets-manager/types";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import type { BracketMapCounts } from "../toMapList";
import { Bracket, type Standing } from "./Bracket";

export class RoundRobinBracket extends Bracket {
	get collectResultsWithPoints() {
		return true;
	}

	source({ placements }: { placements: number[] }): {
		relevantMatchesFinished: boolean;
		teams: number[];
	} {
		invariant(placements.length > 0, "Empty placements not supported");
		if (placements.some((p) => p < 0)) {
			throw new Error("Negative placements not implemented");
		}
		const standings = this.standings;
		const relevantMatchesFinished =
			standings.length === this.participantTournamentTeamIds.length;

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
				points: number;
			}[] = [];

			const updateTeam = ({
				teamId,
				setWins,
				setLosses,
				mapWins,
				mapLosses,
				points,
			}: {
				teamId: number;
				setWins: number;
				setLosses: number;
				mapWins: number;
				mapLosses: number;
				points: number;
			}) => {
				const team = teams.find((team) => team.id === teamId);
				if (team) {
					team.setWins += setWins;
					team.setLosses += setLosses;
					team.mapWins += mapWins;
					team.mapLosses += mapLosses;
					team.points += points;
				} else {
					teams.push({
						id: teamId,
						setWins,
						setLosses,
						mapWins,
						mapLosses,
						winsAgainstTied: 0,
						points,
					});
				}
			};

			for (const match of matches) {
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
						"RoundRobinBracket.standings: winner or loser id not found",
				);

				if (
					typeof winner.totalPoints !== "number" ||
					typeof loser.totalPoints !== "number"
				) {
					logger.warn(
						"RoundRobinBracket.standings: winner or loser points not found",
					);
				}

				// note: score might be missing in the case the set was ended early. In the future we might want to handle this differently than defaulting both to 0.

				updateTeam({
					teamId: winner.id,
					setWins: 1,
					setLosses: 0,
					mapWins: winner.score ?? 0,
					mapLosses: loser.score ?? 0,
					points: winner.totalPoints ?? 0,
				});
				updateTeam({
					teamId: loser.id,
					setWins: 0,
					setLosses: 1,
					mapWins: loser.score ?? 0,
					mapLosses: winner.score ?? 0,
					points: loser.totalPoints ?? 0,
				});
			}

			for (const team of teams) {
				for (const team2 of teams) {
					if (team.id === team2.id) continue;
					if (team.setWins !== team2.setWins) continue;

					// they are different teams and are tied, let's check who won

					const wonTheirMatch = matches.some(
						(match) =>
							(match.opponent1?.id === team.id &&
								match.opponent2?.id === team2.id &&
								match.opponent1?.result === "win") ||
							(match.opponent1?.id === team2.id &&
								match.opponent2?.id === team.id &&
								match.opponent2?.result === "win"),
					);

					if (wonTheirMatch) {
						team.winsAgainstTied++;
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

						if (a.setWins > b.setWins) return -1;
						if (a.setWins < b.setWins) return 1;

						if (a.winsAgainstTied > b.winsAgainstTied) return -1;
						if (a.winsAgainstTied < b.winsAgainstTied) return 1;

						if (a.mapWins > b.mapWins) return -1;
						if (a.mapWins < b.mapWins) return 1;

						if (a.mapLosses < b.mapLosses) return -1;
						if (a.mapLosses > b.mapLosses) return 1;

						if (a.points > b.points) return -1;
						if (a.points < b.points) return 1;

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
								points: team.points,
								winsAgainstTied: team.winsAgainstTied,
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

	get type(): Tables["TournamentStage"]["type"] {
		return "round_robin";
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
}

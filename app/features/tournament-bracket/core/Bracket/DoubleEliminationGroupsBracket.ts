import type { Tables } from "~/db/tables";
import type { TournamentManagerDataSet } from "~/modules/brackets-manager/types";
import invariant from "~/utils/invariant";
import type { BracketMapCounts } from "../toMapList";
import { Bracket, type Standing } from "./Bracket";

export class DoubleEliminationGroupsBracket extends Bracket {
	get type(): Tables["TournamentStage"]["type"] {
		return "double_elimination_groups";
	}

	get collectResultsWithPoints() {
		return false;
	}

	// xxx: can we reuse logic from DoubleElimination somehow? like extend the class
	defaultRoundBestOfs(data: TournamentManagerDataSet) {
		const result: BracketMapCounts = new Map();

		for (const group of data.group) {
			const roundsOfGroup = data.round.filter(
				(round) => round.group_id === group.id,
			);

			const groupType = this.getGroupType(group.number);

			const defaultOfRound = (roundNumber: number) => {
				if (groupType === "gf") return 5;
				if (groupType === "lb") {
					const lastRoundNumber = Math.max(
						...roundsOfGroup.map((round) => round.number),
					);

					if (roundNumber === lastRoundNumber) return 5;
					return 3;
				}

				if (roundNumber > 2) return 5;
				return 3;
			};

			for (const round of roundsOfGroup) {
				const atLeastOneNonByeMatch = data.match.some(
					(match) =>
						match.round_id === round.id && match.opponent1 && match.opponent2,
				);

				if (!atLeastOneNonByeMatch) continue;

				if (!result.get(group.id)) {
					result.set(group.id, new Map());
				}

				result.get(group.id)!.set(round.number, {
					count: defaultOfRound(round.number),
					type: "BEST_OF",
				});
			}
		}

		return result;
	}

	get standings(): Standing[] {
		if (!this.enoughTeams) return [];

		const poolCount = this.getPoolCount();
		const allStandings: Standing[] = [];

		for (let poolIdx = 0; poolIdx < poolCount; poolIdx++) {
			const poolStandings = this.getPoolStandings(poolIdx);
			allStandings.push(...poolStandings);
		}

		return this.standingsWithoutNonParticipants(
			allStandings.sort((a, b) => {
				if (a.placement !== b.placement) {
					return a.placement - b.placement;
				}
				return (a.groupId ?? 0) - (b.groupId ?? 0);
			}),
		);
	}

	source({ placements }: { placements: number[] }): {
		relevantMatchesFinished: boolean;
		teams: number[];
	} {
		invariant(placements.length > 0, "Empty placements not supported");

		const hasPositive = placements.some((p) => p > 0);
		const hasNegative = placements.some((p) => p < 0);

		invariant(
			!(hasPositive && hasNegative),
			"Cannot mix positive and negative placements",
		);

		if (hasNegative) {
			return this.sourceFromLosers(placements);
		}

		return this.sourceFromWinners(placements);
	}

	private sourceFromWinners(placements: number[]) {
		const poolCount = this.getPoolCount();
		const teams: number[] = [];
		let relevantMatchesFinished = true;

		for (let poolIdx = 0; poolIdx < poolCount; poolIdx++) {
			const gfGroupNumber = poolIdx * 3 + 3;
			const gfGroup = this.data.group.find((g) => g.number === gfGroupNumber);

			if (gfGroup) {
				const gfMatches = this.data.match.filter(
					(m) => m.group_id === gfGroup.id,
				);

				if (gfMatches.length > 0) {
					const gfMatch = gfMatches[0];
					const gfComplete =
						gfMatch.opponent1?.result === "win" ||
						gfMatch.opponent2?.result === "win";
					const gfWontBePlayed =
						gfMatch.opponent1?.id && !gfMatch.opponent2?.id;

					if (placements.includes(1)) {
						if (gfComplete) {
							const winnerId =
								gfMatch.opponent1?.result === "win"
									? gfMatch.opponent1.id
									: gfMatch.opponent2?.id;
							if (winnerId) teams.push(winnerId);
						} else if (gfWontBePlayed && gfMatch.opponent1?.id) {
							teams.push(gfMatch.opponent1.id);
						} else {
							relevantMatchesFinished = false;
						}
					}

					if (placements.includes(2)) {
						if (gfComplete) {
							const loserId =
								gfMatch.opponent1?.result === "win"
									? gfMatch.opponent2?.id
									: gfMatch.opponent1?.id;
							if (loserId) teams.push(loserId);
						} else {
							relevantMatchesFinished = false;
						}
					}
				}
			} else {
				const { wbWinner, lbWinner, finished } = this.getPoolFinalists(poolIdx);

				if (placements.includes(1)) {
					if (wbWinner) {
						teams.push(wbWinner);
					} else {
						relevantMatchesFinished = false;
					}
				}

				if (placements.includes(2)) {
					if (lbWinner) {
						teams.push(lbWinner);
					} else {
						relevantMatchesFinished = false;
					}
				}

				if (!finished) {
					relevantMatchesFinished = false;
				}
			}
		}

		return { relevantMatchesFinished, teams };
	}

	private sourceFromLosers(placements: number[]) {
		const poolCount = this.getPoolCount();
		const teams: number[] = [];
		let relevantMatchesFinished = true;

		for (let poolIdx = 0; poolIdx < poolCount; poolIdx++) {
			const lbGroupNumber = poolIdx * 3 + 2;
			const lbGroup = this.data.group.find((g) => g.number === lbGroupNumber);

			if (!lbGroup) continue;

			const lbMatches = this.data.match
				.filter((m) => m.group_id === lbGroup.id)
				.sort((a, b) => a.round_id - b.round_id);

			const absPlacement = Math.abs(Math.min(...placements));
			const roundsToConsider = absPlacement;

			const roundIds = [...new Set(lbMatches.map((m) => m.round_id))].sort(
				(a, b) => a - b,
			);
			const targetRoundIds = roundIds.slice(0, roundsToConsider);

			for (const roundId of targetRoundIds.sort((a, b) => b - a)) {
				const roundMatches = lbMatches.filter((m) => m.round_id === roundId);

				for (const match of roundMatches) {
					if (!match.opponent1 || !match.opponent2) continue;

					if (
						match.opponent1?.result !== "win" &&
						match.opponent2?.result !== "win"
					) {
						relevantMatchesFinished = false;
						continue;
					}

					const loserId =
						match.opponent1?.result === "win"
							? match.opponent2?.id
							: match.opponent1?.id;
					if (loserId) teams.push(loserId);
				}
			}
		}

		return { relevantMatchesFinished, teams };
	}

	private getPoolCount(): number {
		const maxGroupNumber = Math.max(...this.data.group.map((g) => g.number));
		return Math.ceil(maxGroupNumber / 3);
	}

	private getGroupType(groupNumber: number): "wb" | "lb" | "gf" {
		const mod = groupNumber % 3;
		if (mod === 1) return "wb";
		if (mod === 2) return "lb";
		return "gf";
	}

	private getPoolStandings(poolIdx: number): Standing[] {
		const lbGroupNumber = poolIdx * 3 + 2;
		const gfGroupNumber = poolIdx * 3 + 3;

		const lbGroup = this.data.group.find((g) => g.number === lbGroupNumber);
		const gfGroup = this.data.group.find((g) => g.number === gfGroupNumber);

		const standings: Standing[] = [];

		if (gfGroup) {
			const gfMatches = this.data.match.filter(
				(m) => m.group_id === gfGroup.id,
			);

			if (gfMatches.length > 0) {
				const gfMatch = gfMatches[0];

				if (
					gfMatch.opponent1?.result === "win" ||
					gfMatch.opponent2?.result === "win"
				) {
					const winnerId =
						gfMatch.opponent1?.result === "win"
							? gfMatch.opponent1.id
							: gfMatch.opponent2?.id;
					const loserId =
						gfMatch.opponent1?.result === "win"
							? gfMatch.opponent2?.id
							: gfMatch.opponent1?.id;

					if (winnerId) {
						const team = this.tournament.teamById(winnerId);
						if (team) {
							standings.push({ team, placement: 1, groupId: poolIdx });
						}
					}
					if (loserId) {
						const team = this.tournament.teamById(loserId);
						if (team) {
							standings.push({ team, placement: 2, groupId: poolIdx });
						}
					}
				}
			}
		}

		if (lbGroup) {
			const lbMatches = this.data.match
				.filter((m) => m.group_id === lbGroup.id)
				.sort((a, b) => a.round_id - b.round_id);

			let currentPlacement = standings.length > 0 ? 3 : 1;

			const roundIds = [...new Set(lbMatches.map((m) => m.round_id))].sort(
				(a, b) => b - a,
			);

			for (const roundId of roundIds) {
				const roundMatches = lbMatches.filter((m) => m.round_id === roundId);
				const losersThisRound: number[] = [];

				for (const match of roundMatches) {
					if (!match.opponent1 || !match.opponent2) continue;

					if (
						match.opponent1?.result !== "win" &&
						match.opponent2?.result !== "win"
					) {
						continue;
					}

					const loserId =
						match.opponent1?.result === "win"
							? match.opponent2?.id
							: match.opponent1?.id;
					if (loserId) losersThisRound.push(loserId);
				}

				for (const loserId of losersThisRound) {
					const team = this.tournament.teamById(loserId);
					if (team) {
						standings.push({
							team,
							placement: currentPlacement,
							groupId: poolIdx,
						});
					}
				}

				if (losersThisRound.length > 0) {
					currentPlacement += losersThisRound.length;
				}
			}
		}

		return standings;
	}

	private getPoolFinalists(poolIdx: number): {
		wbWinner: number | null;
		lbWinner: number | null;
		finished: boolean;
	} {
		const wbGroupNumber = poolIdx * 3 + 1;
		const lbGroupNumber = poolIdx * 3 + 2;

		const wbGroup = this.data.group.find((g) => g.number === wbGroupNumber);
		const lbGroup = this.data.group.find((g) => g.number === lbGroupNumber);

		let wbWinner: number | null = null;
		let lbWinner: number | null = null;
		let finished = true;

		if (wbGroup) {
			const wbMatches = this.data.match
				.filter((m) => m.group_id === wbGroup.id)
				.sort((a, b) => b.round_id - a.round_id);

			if (wbMatches.length > 0) {
				const finalMatch = wbMatches[0];
				if (
					finalMatch.opponent1?.result === "win" ||
					finalMatch.opponent2?.result === "win"
				) {
					wbWinner =
						finalMatch.opponent1?.result === "win"
							? (finalMatch.opponent1.id ?? null)
							: (finalMatch.opponent2?.id ?? null);
				} else {
					finished = false;
				}
			}
		}

		if (lbGroup) {
			const lbMatches = this.data.match
				.filter((m) => m.group_id === lbGroup.id)
				.sort((a, b) => b.round_id - a.round_id);

			if (lbMatches.length > 0) {
				const finalMatch = lbMatches[0];
				if (
					finalMatch.opponent1?.result === "win" ||
					finalMatch.opponent2?.result === "win"
				) {
					lbWinner =
						finalMatch.opponent1?.result === "win"
							? (finalMatch.opponent1.id ?? null)
							: (finalMatch.opponent2?.id ?? null);
				} else {
					finished = false;
				}
			}
		}

		return { wbWinner, lbWinner, finished };
	}
}

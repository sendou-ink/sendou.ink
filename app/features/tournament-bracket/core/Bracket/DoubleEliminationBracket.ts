import * as R from "remeda";
import type { Tables } from "~/db/tables";
import type { TournamentManagerDataSet } from "~/modules/brackets-manager/types";
import type { Round } from "~/modules/brackets-model";
import invariant from "~/utils/invariant";
import type { BracketMapCounts } from "../toMapList";
import { Bracket, type Standing } from "./Bracket";

export class DoubleEliminationBracket extends Bracket {
	get type(): Tables["TournamentStage"]["type"] {
		return "double_elimination";
	}

	defaultRoundBestOfs(data: TournamentManagerDataSet) {
		const result: BracketMapCounts = new Map();

		for (const group of data.group) {
			const roundsOfGroup = data.round.filter(
				(round) => round.group_id === group.id,
			);

			const defaultOfRound = (round: Round) => {
				if (group.number === 3) return 5;
				if (group.number === 2) {
					const lastRoundNumber = Math.max(
						...roundsOfGroup.map((round) => round.number),
					);

					if (round.number === lastRoundNumber) return 5;
					return 3;
				}

				if (round.number > 2) return 5;
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

				result
					.get(group.id)!
					.set(round.number, { count: defaultOfRound(round), type: "BEST_OF" });
			}
		}

		return result;
	}

	winnersSourceRound(roundNumber: number) {
		const isMajorRound = roundNumber === 1 || roundNumber % 2 === 0;
		if (!isMajorRound) return;

		const roundNumberWB = Math.ceil((roundNumber + 1) / 2);

		const groupIdWB = this.data.group.find((g) => g.number === 1)?.id;

		return this.data.round.find(
			(round) => round.number === roundNumberWB && round.group_id === groupIdWB,
		);
	}

	get standings(): Standing[] {
		if (!this.enoughTeams) return [];

		const losersGroupId = this.data.group.find((g) => g.number === 2)?.id;

		const teams: { id: number; lostAt: number }[] = [];

		for (const match of this.data.match
			.slice()
			.sort((a, b) => a.round_id - b.round_id)) {
			if (match.group_id !== losersGroupId) continue;

			if (
				match.opponent1?.result !== "win" &&
				match.opponent2?.result !== "win"
			) {
				continue;
			}

			// BYE
			if (!match.opponent1 || !match.opponent2) continue;

			const loser =
				match.opponent1?.result === "win" ? match.opponent2 : match.opponent1;
			invariant(loser?.id, "Loser id not found");

			teams.push({ id: loser.id, lostAt: match.round_id });
		}

		const teamCountWhoDidntLoseInLosersYet =
			this.participantTournamentTeamIds.length - teams.length;

		const result: Standing[] = [];
		for (const roundId of R.unique(teams.map((team) => team.lostAt))) {
			const teamsLostThisRound: { id: number }[] = [];
			while (teams.length && teams[0].lostAt === roundId) {
				teamsLostThisRound.push(teams.shift()!);
			}

			for (const { id: teamId } of teamsLostThisRound) {
				const team = this.tournament.teamById(teamId);
				invariant(team, `Team not found for id: ${teamId}`);

				const teamsPlacedAbove =
					teamCountWhoDidntLoseInLosersYet + teams.length;

				result.push({
					team,
					placement: teamsPlacedAbove + 1,
				});
			}
		}

		// edge case: 1 match only
		const noLosersRounds = !losersGroupId;
		const grandFinalsNumber = noLosersRounds ? 1 : 3;
		const grandFinalsGroupId = this.data.group.find(
			(g) => g.number === grandFinalsNumber,
		)?.id;
		invariant(grandFinalsGroupId, "GF group not found");
		const grandFinalMatches = this.data.match.filter(
			(match) => match.group_id === grandFinalsGroupId,
		);

		// if opponent1 won in DE it means that bracket reset is not played
		if (
			grandFinalMatches[0].opponent1 &&
			(noLosersRounds || grandFinalMatches[0].opponent1.result === "win")
		) {
			const loser =
				grandFinalMatches[0].opponent1.result === "win"
					? "opponent2"
					: "opponent1";
			const winner = loser === "opponent1" ? "opponent2" : "opponent1";

			const loserTeam = this.tournament.teamById(
				grandFinalMatches[0][loser]!.id!,
			);
			invariant(loserTeam, "Loser team not found");
			const winnerTeam = this.tournament.teamById(
				grandFinalMatches[0][winner]!.id!,
			);
			invariant(winnerTeam, "Winner team not found");

			result.push({
				team: loserTeam,
				placement: 2,
			});

			result.push({
				team: winnerTeam,
				placement: 1,
			});
		} else if (
			grandFinalMatches[1].opponent1?.result === "win" ||
			grandFinalMatches[1].opponent2?.result === "win"
		) {
			const loser =
				grandFinalMatches[1].opponent1?.result === "win"
					? "opponent2"
					: "opponent1";
			const winner = loser === "opponent1" ? "opponent2" : "opponent1";

			const loserTeam = this.tournament.teamById(
				grandFinalMatches[1][loser]!.id!,
			);
			invariant(loserTeam, "Loser team not found");
			const winnerTeam = this.tournament.teamById(
				grandFinalMatches[1][winner]!.id!,
			);
			invariant(winnerTeam, "Winner team not found");

			result.push({
				team: loserTeam,
				placement: 2,
			});

			result.push({
				team: winnerTeam,
				placement: 1,
			});
		}

		return this.standingsWithoutNonParticipants(result.reverse());
	}

	get everyMatchOver() {
		if (this.preview) return false;

		let lastWinner = -1;
		for (const [i, match] of this.data.match.entries()) {
			// special case - bracket reset might not be played depending on who wins in the grands
			const isLast = i === this.data.match.length - 1;
			if (isLast && lastWinner === 1) {
				continue;
			}
			// BYE
			if (match.opponent1 === null || match.opponent2 === null) {
				continue;
			}
			if (
				match.opponent1?.result !== "win" &&
				match.opponent2?.result !== "win"
			) {
				return false;
			}

			lastWinner = match.opponent1?.result === "win" ? 1 : 2;
		}

		return true;
	}

	// xxx: unit test
	source({ placements }: { placements: number[] }) {
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
		const teams: number[] = [];
		let relevantMatchesFinished = true;

		const noLosersRounds = !this.data.group.find((g) => g.number === 2);
		const grandFinalsNumber = noLosersRounds ? 1 : 3;
		const grandFinalsGroupId = this.data.group.find(
			(g) => g.number === grandFinalsNumber,
		)?.id;

		const winnersGroupId = this.data.group.find((g) => g.number === 1)?.id;
		const losersGroupId = this.data.group.find((g) => g.number === 2)?.id;

		if (grandFinalsGroupId) {
			const gfMatches = this.data.match.filter(
				(m) => m.group_id === grandFinalsGroupId,
			);

			if (gfMatches.length > 0) {
				const gfMatch = gfMatches[0];
				const gfResetMatch = gfMatches[1];

				const gfFinished =
					gfMatch.opponent1?.result === "win" ||
					(gfResetMatch &&
						(gfResetMatch.opponent1?.result === "win" ||
							gfResetMatch.opponent2?.result === "win"));

				if (placements.includes(1)) {
					if (gfFinished) {
						const finalMatch =
							gfResetMatch?.opponent1?.result === "win" ||
							gfResetMatch?.opponent2?.result === "win"
								? gfResetMatch
								: gfMatch;
						const winnerId =
							finalMatch.opponent1?.result === "win"
								? finalMatch.opponent1.id
								: finalMatch.opponent2?.id;
						if (winnerId) teams.push(winnerId);
					} else {
						relevantMatchesFinished = false;
					}
				}

				if (placements.includes(2)) {
					if (gfFinished) {
						const finalMatch =
							gfResetMatch?.opponent1?.result === "win" ||
							gfResetMatch?.opponent2?.result === "win"
								? gfResetMatch
								: gfMatch;
						const loserId =
							finalMatch.opponent1?.result === "win"
								? finalMatch.opponent2?.id
								: finalMatch.opponent1?.id;
						if (loserId) teams.push(loserId);
					} else {
						relevantMatchesFinished = false;
					}
				}
			}
		} else {
			if (placements.includes(1) && winnersGroupId) {
				const wbMatches = this.data.match
					.filter((m) => m.group_id === winnersGroupId)
					.sort((a, b) => b.round_id - a.round_id);

				if (wbMatches.length > 0) {
					const finalMatch = wbMatches[0];
					if (
						finalMatch.opponent1?.result === "win" ||
						finalMatch.opponent2?.result === "win"
					) {
						const winnerId =
							finalMatch.opponent1?.result === "win"
								? finalMatch.opponent1.id
								: finalMatch.opponent2?.id;
						if (winnerId) teams.push(winnerId);
					} else {
						relevantMatchesFinished = false;
					}
				}
			}

			if (placements.includes(2) && losersGroupId) {
				const lbMatches = this.data.match
					.filter((m) => m.group_id === losersGroupId)
					.sort((a, b) => b.round_id - a.round_id);

				if (lbMatches.length > 0) {
					const finalMatch = lbMatches[0];
					if (
						finalMatch.opponent1?.result === "win" ||
						finalMatch.opponent2?.result === "win"
					) {
						const winnerId =
							finalMatch.opponent1?.result === "win"
								? finalMatch.opponent1.id
								: finalMatch.opponent2?.id;
						if (winnerId) teams.push(winnerId);
					} else {
						relevantMatchesFinished = false;
					}
				}
			}
		}

		return { relevantMatchesFinished, teams };
	}

	private sourceFromLosers(placements: number[]) {
		const resolveLosersGroupId = (data: TournamentManagerDataSet) => {
			const minGroupId = Math.min(...data.round.map((round) => round.group_id));

			return minGroupId + 1;
		};
		const placementsToRoundsIds = (
			data: TournamentManagerDataSet,
			losersGroupId: number,
		) => {
			const firstRoundIsOnlyByes = () => {
				const losersMatches = data.match.filter(
					(match) => match.group_id === losersGroupId,
				);

				const fistRoundId = Math.min(...losersMatches.map((m) => m.round_id));

				const firstRoundMatches = losersMatches.filter(
					(match) => match.round_id === fistRoundId,
				);

				return firstRoundMatches.every(
					(match) => match.opponent1 === null || match.opponent2 === null,
				);
			};

			const losersRounds = data.round.filter(
				(round) => round.group_id === losersGroupId,
			);
			const orderedRoundsIds = losersRounds
				.map((round) => round.id)
				.sort((a, b) => a - b);
			const amountOfRounds =
				Math.abs(Math.min(...placements)) + (firstRoundIsOnlyByes() ? 1 : 0);

			return orderedRoundsIds.slice(0, amountOfRounds);
		};

		const losersGroupId = resolveLosersGroupId(this.data);
		const sourceRoundsIds = placementsToRoundsIds(
			this.data,
			losersGroupId,
		).sort((a, b) => b - a);

		const teams: number[] = [];
		let relevantMatchesFinished = true;
		for (const roundId of sourceRoundsIds) {
			const roundsMatches = this.data.match.filter(
				(match) => match.round_id === roundId,
			);

			for (const match of roundsMatches) {
				if (!match.opponent1 || !match.opponent2) {
					continue;
				}
				if (
					match.opponent1?.result !== "win" &&
					match.opponent2?.result !== "win"
				) {
					relevantMatchesFinished = false;
					continue;
				}

				const loser =
					match.opponent1?.result === "win" ? match.opponent2 : match.opponent1;
				invariant(loser?.id, "Loser id not found");

				teams.push(loser.id);
			}
		}

		return {
			relevantMatchesFinished,
			teams,
		};
	}
}

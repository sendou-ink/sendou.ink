import { useTournament } from "~/features/tournament/routes/to.$id";
import type { Round } from "~/modules/brackets-model";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import { logger } from "~/utils/logger";
import type { Bracket } from "../../core/Bracket";

const MINUTES = {
	BO1: 20,
	BO3: 30,
	BO5: 40,
	BO7: 50,
};

const STRICT_MINUTES = {
	BO1: 15,
	BO3: 25,
	BO5: 35,
	BO7: 45,
};

const minutesToPlay = (count: number, strict: boolean) => {
	if (count === 1) return strict ? STRICT_MINUTES.BO1 : MINUTES.BO1;
	if (count === 3) return strict ? STRICT_MINUTES.BO3 : MINUTES.BO3;
	if (count === 5) return strict ? STRICT_MINUTES.BO5 : MINUTES.BO5;
	if (count === 7) return strict ? STRICT_MINUTES.BO7 : MINUTES.BO7;

	logger.warn("Unknown best of count", { count });
	return MINUTES.BO5;
};

export function useDeadline(roundId: number, bestOf: number) {
	const tournament = useTournament();

	try {
		const bracket = tournament.brackets.find((b) =>
			b.data.round.some((r) => r.id === roundId),
		);
		if (!bracket) return null;

		const roundIdx = bracket.data.round.findIndex((r) => r.id === roundId);
		const round = bracket.data.round[roundIdx];
		if (!round) return null;

		const isFirstRoundOfBracket =
			roundIdx === 0 ||
			((bracket.type === "round_robin" || bracket.type === "swiss") &&
				round.number === 1);

		const matches = bracket.data.match.filter((m) => m.round_id === roundId);
		const everyMatchHasStarted = matches.every(
			(m) =>
				(!m.opponent1 || m.opponent1.id) && (!m.opponent2 || m.opponent2?.id),
		);

		if (!everyMatchHasStarted) return null;

		let dl: Date | null;
		if (isFirstRoundOfBracket) {
			// should not happen
			if (!bracket.createdAt) return null;

			dl = databaseTimestampToDate(bracket.createdAt);
		} else {
			const losersGroupId = bracket.data.group.find((g) => g.number === 2)?.id;
			if (
				bracket.type === "single_elimination" ||
				(bracket.type === "double_elimination" &&
					round.group_id !== losersGroupId)
			) {
				dl = dateByPreviousRound(bracket, round);
			} else if (bracket.type === "swiss") {
				dl = dateByRoundMatch(bracket, round);
			} else if (bracket.type === "round_robin") {
				dl = dateByManyPreviousRounds(bracket, round);
			} else {
				dl = dateByPreviousRoundAndWinners(bracket, round);
			}
		}

		if (!dl) return null;

		dl.setMinutes(
			dl.getMinutes() +
				minutesToPlay(bestOf, tournament.ctx.settings.deadlines === "STRICT"),
		);

		return dl;
	} catch (e) {
		logger.error("useDeadline", { roundId, bestOf }, e);
		return null;
	}
}

function dateByPreviousRound(bracket: Bracket, round: Round) {
	const previousRound = bracket.data.round.find(
		(r) => r.number === round.number - 1 && round.group_id === r.group_id,
	);
	if (!previousRound) {
		// single elimination 3rd place match -> no deadline
		if (bracket.type !== "single_elimination") {
			logger.warn("Previous round not found", { bracket, round });
		}
		return null;
	}

	let maxFinishedAt = 0;
	for (const match of bracket.data.match.filter(
		(m) => m.round_id === previousRound.id,
	)) {
		if (!match.opponent1 || !match.opponent2) {
			continue;
		}

		if (match.opponent1.result !== "win" && match.opponent2.result !== "win") {
			return null;
		}

		maxFinishedAt = Math.max(maxFinishedAt, match.lastGameFinishedAt ?? 0);
	}

	if (maxFinishedAt === 0) {
		return null;
	}

	return databaseTimestampToDate(maxFinishedAt);
}

function dateByRoundMatch(bracket: Bracket, round: Round) {
	const roundMatch = bracket.data.match.find((m) => m.round_id === round.id);

	if (!roundMatch?.createdAt) {
		return null;
	}

	return databaseTimestampToDate(roundMatch.createdAt);
}

function dateByManyPreviousRounds(bracket: Bracket, round: Round) {
	const relevantRounds = bracket.data.round.filter(
		(r) => r.number === round.number - 1,
	);
	const allMatches = bracket.data.match.filter((match) =>
		relevantRounds.some((round) => round.id === match.round_id),
	);

	let maxFinishedAt = 0;
	for (const match of allMatches) {
		if (!match.opponent1 || !match.opponent2) {
			continue;
		}

		if (match.opponent1.result !== "win" && match.opponent2.result !== "win") {
			return null;
		}

		maxFinishedAt = Math.max(maxFinishedAt, match.lastGameFinishedAt ?? 0);
	}

	if (maxFinishedAt === 0) {
		return null;
	}

	return databaseTimestampToDate(maxFinishedAt);
}

function dateByPreviousRoundAndWinners(bracket: Bracket, round: Round) {
	const byPreviousRound =
		round.number > 1 ? dateByPreviousRound(bracket, round) : null;
	const winnersRound = bracket.winnersSourceRound(round.number);

	if (!winnersRound) return byPreviousRound;

	let maxFinishedAtWB = 0;
	for (const match of bracket.data.match.filter(
		(m) => m.round_id === winnersRound.id,
	)) {
		if (!match.opponent1 || !match.opponent2) {
			continue;
		}

		if (match.opponent1.result !== "win" && match.opponent2.result !== "win") {
			return null;
		}

		maxFinishedAtWB = Math.max(maxFinishedAtWB, match.lastGameFinishedAt ?? 0);
	}

	if (!byPreviousRound && !maxFinishedAtWB) return null;
	if (!byPreviousRound) return databaseTimestampToDate(maxFinishedAtWB);
	if (!maxFinishedAtWB) return byPreviousRound;

	return databaseTimestampToDate(
		Math.max(dateToDatabaseTimestamp(byPreviousRound), maxFinishedAtWB),
	);
}

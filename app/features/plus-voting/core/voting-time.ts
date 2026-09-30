import { Config } from "~/config";
import * as Seasons from "../../mmr/core/Seasons";
import type { MonthYear } from "./types";

/** Lets the voting page be tested outside a voting window. */
const VOTING_ALWAYS_OPEN =
	process.env.NODE_ENV === "development" && !Config.prodMode;

export function lastCompletedVoting(now: Date): MonthYear {
	let match: { startDate: Date; endDate: Date } | null = null;
	for (const season of Seasons.list) {
		const range = seasonToVotingRange(season);

		if (now.getTime() > range.endDate.getTime()) {
			match = range;
		} else if (now.getTime() < range.endDate.getTime()) {
			break;
		}
	}

	if (!match) {
		throw new Error("No previous voting found.");
	}

	return rangeToMonthYear(match);
}

export function nextNonCompletedVoting(now: Date) {
	for (const season of Seasons.list) {
		const range = seasonToVotingRange(season);

		if (now.getTime() < range.endDate.getTime()) {
			return range;
		}
	}

	return null;
}

export function rangeToMonthYear(range: { startDate: Date; endDate: Date }) {
	return {
		month: range.startDate.getMonth(),
		year: range.startDate.getFullYear(),
	};
}

export function seasonToVotingRange(season: Seasons.ListItem) {
	const { ends: date } = season;

	if (date.getUTCDay() !== 0) {
		throw new Error("End date is not a Sunday.");
	}

	const endDate = new Date(date);
	endDate.setUTCDate(endDate.getUTCDate() - 7);
	endDate.setUTCHours(18, 0, 0, 0);

	const startDate = new Date(endDate);
	startDate.setUTCDate(startDate.getUTCDate() - 2);

	return { startDate, endDate };
}

/** Whether votes can be cast; unlike {@link isVotingActive} (which also locks suggesting) always true in local dev. */
export function isVotingOpen() {
	return VOTING_ALWAYS_OPEN || isVotingActive();
}

let votingActiveOverride = false;

/** Tests only: fakes an ongoing voting window for {@link isVotingActive}. */
export function DANGEROUS_setVotingActiveOverride(votingActive: boolean) {
	votingActiveOverride = votingActive;
}

export function isVotingActive() {
	if (votingActiveOverride) return true;

	const now = new Date();

	for (const season of Seasons.list) {
		const { startDate, endDate } = seasonToVotingRange(season);

		if (
			now.getTime() > startDate.getTime() &&
			now.getTime() < endDate.getTime()
		) {
			return true;
		}
	}

	return false;
}

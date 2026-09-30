import { addWeeks, startOfWeek } from "date-fns";
import { databaseTimestampToDate } from "~/utils/dates";

interface SetParticipant {
	otherUserId: number;
	type: "MATE" | "ENEMY";
	/** Database timestamp of the set */
	playedAt: number;
}

/** `[week index, sets played]` for each week with at least one set, ascending. The index points to `weeks` of `summarize`. */
type SetsPerWeek = Array<[number, number]>;

/**
 * Buckets the user's sets per week and per player they played with or against.
 * The weeks span from the week of the user's first set to the week of their last.
 */
export function summarize(participants: SetParticipant[]) {
	const weeks = weekStartsBetween(participants.map((p) => p.playedAt));
	const players = {
		MATE: new Map<number, SetsPerWeek>(),
		ENEMY: new Map<number, SetsPerWeek>(),
	};

	for (const participant of participants) {
		const weekIndex = weeks.indexOf(weekStart(participant.playedAt));
		const setsPerWeek =
			players[participant.type].get(participant.otherUserId) ?? [];

		const week = setsPerWeek.find(([index]) => index === weekIndex);
		if (week) {
			week[1]++;
		} else {
			setsPerWeek.push([weekIndex, 1]);
		}

		players[participant.type].set(participant.otherUserId, setsPerWeek);
	}

	for (const setsPerWeek of [
		...players.MATE.values(),
		...players.ENEMY.values(),
	]) {
		setsPerWeek.sort((a, b) => a[0] - b[0]);
	}

	return { weeks, players };
}

/** Sets played per week with zeroes filled in for the weeks without any, as `{ x: week start, y: sets }` points. */
export function weeklyPoints({
	weeks,
	setsPerWeek,
}: {
	weeks: number[];
	setsPerWeek: SetsPerWeek;
}) {
	const setsByWeekIndex = new Map(setsPerWeek);

	return weeks.map((week, index) => ({
		x: week,
		y: setsByWeekIndex.get(index) ?? 0,
	}));
}

function weekStartsBetween(playedAts: number[]) {
	if (playedAts.length === 0) return [];

	const first = weekStart(Math.min(...playedAts));
	const last = weekStart(Math.max(...playedAts));

	const result: number[] = [];
	for (let week = first; week <= last; week = addWeeks(week, 1).getTime()) {
		result.push(week);
	}

	return result;
}

function weekStart(playedAt: number) {
	return startOfWeek(databaseTimestampToDate(playedAt), {
		weekStartsOn: 1,
	}).getTime();
}

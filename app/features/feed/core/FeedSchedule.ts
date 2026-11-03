import { FEED_SCHEDULED_POST_HOUR_UTC } from "../feed-constants";

const DAY_MS = 24 * 60 * 60 * 1000;

export const WEEKDAY = {
	SUNDAY: 0,
	MONDAY: 1,
	WEDNESDAY: 3,
	FRIDAY: 5,
} as const;

/** The latest moment at or before `now` that is the given UTC weekday & hour. */
export function latestWeekly(
	now: Date,
	{
		weekday,
		hour = FEED_SCHEDULED_POST_HOUR_UTC,
	}: { weekday: number; hour?: number },
) {
	const daysBack = (now.getUTCDay() - weekday + 7) % 7;
	const candidate = new Date(
		Date.UTC(
			now.getUTCFullYear(),
			now.getUTCMonth(),
			now.getUTCDate() - daysBack,
			hour,
		),
	);

	return candidate > now
		? new Date(candidate.getTime() - 7 * DAY_MS)
		: candidate;
}

/**
 * The tournament showcase post live at `now`: Monday morning's covers the weekdays until Friday
 * morning, Friday morning's the weekend until Monday morning.
 */
export function showcaseWindow(now: Date) {
	const monday = latestWeekly(now, { weekday: WEEKDAY.MONDAY });
	const friday = latestWeekly(now, { weekday: WEEKDAY.FRIDAY });

	if (monday > friday) {
		return {
			kind: "WEEKDAYS" as const,
			publishedAt: monday,
			endsAt: new Date(monday.getTime() + 4 * DAY_MS),
		};
	}

	return {
		kind: "WEEKEND" as const,
		publishedAt: friday,
		endsAt: new Date(friday.getTime() + 3 * DAY_MS),
	};
}

/** The latest anniversary of `createdAt` at or before `now`, `null` before the first one. */
export function latestAnniversary(createdAt: Date, now: Date) {
	let years = now.getUTCFullYear() - createdAt.getUTCFullYear();
	const anniversaryOf = (yearsAfter: number) => {
		const date = new Date(createdAt);
		date.setUTCFullYear(createdAt.getUTCFullYear() + yearsAfter);
		return date;
	};

	if (anniversaryOf(years) > now) years--;
	if (years < 1) return null;

	return { at: anniversaryOf(years), years };
}

/** The largest milestone (1, 2 or 5 times a power of ten, at least `min`) that `count` has reached. */
export function reachedMilestone(count: number, min: number) {
	let reached: number | null = null;

	for (let power = 1; power <= count; power *= 10) {
		for (const multiplier of [1, 2, 5]) {
			const milestone = power * multiplier;
			if (milestone >= min && milestone <= count) reached = milestone;
		}
	}

	return reached;
}

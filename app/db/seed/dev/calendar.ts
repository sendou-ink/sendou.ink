import { dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { faker } from "../core/faker";
import * as showcaseNames from "../core/showcaseNames";
import * as CalendarEventFactory from "../factories/CalendarEventFactory";
import * as CalendarEventResultFactory from "../factories/CalendarEventResultFactory";
import type { SeededBadges } from "./badges";
import type { SeededUsers } from "./users";

const EVENT_COUNT = 200;
const RESULT_TARGET_USER_RESULTS = 8;
/** Results N-ZAP is placed in, enough for his results page to paginate. */
const NZAP_RESULT_COUNT = 30;

export type SeededCalendarEvents = {
	/** Result teams N-ZAP played on, in the order they were reported. */
	nzapResultTeamIds: number[];
};

export async function seedCalendarEvents(
	users: SeededUsers,
	badges: SeededBadges,
): Promise<SeededCalendarEvents> {
	const authorPool = [...users.showcaseIds, ...users.crowdIds];
	const nzapResultTeamIds: number[] = [];

	for (let i = 0; i < EVENT_COUNT; i++) {
		const startTime = fakeStartTime(i);

		const event = await CalendarEventFactory.create({
			name: showcaseNames.eventName(),
			authorId: i === 0 ? users.nzapId : faker.helpers.arrayElement(authorPool),
			badges:
				faker.number.float(1) < 0.25
					? faker.helpers.arrayElements(badges.ids, { min: 1, max: 3 })
					: [],
			startTimes: fakeStartTimes(startTime),
			// the rest fall back to the default logo, as an event without one does
			hasAvatar: faker.number.float(1) < 0.4,
		});

		const isPast = startTime.getTime() < Date.now();
		if (isPast && faker.number.float(1) < 0.6) {
			const withNzap = nzapResultTeamIds.length < NZAP_RESULT_COUNT;

			const result = await CalendarEventResultFactory.create({
				eventId: event.id,
				results: fakeResults(users, withNzap ? users.nzapId : null),
			});

			if (withNzap) {
				nzapResultTeamIds.push(nzapTeamId(result.teams, users.nzapId));
			}
		}
	}

	return { nzapResultTeamIds };
}

function nzapTeamId(
	teams: Awaited<ReturnType<typeof CalendarEventResultFactory.create>>["teams"],
	nzapId: number,
) {
	const team = teams.find((team) =>
		team.players.some((player) => player.id === nzapId),
	);
	invariant(team, "N-ZAP was not placed in the results");

	return team.id;
}

function fakeStartTime(index: number) {
	const startTime =
		index % 2 === 0
			? faker.date.soon({ days: 42 })
			: faker.date.recent({ days: 240 });
	startTime.setMinutes(0, 0, 0);

	return startTime;
}

function fakeStartTimes(startTime: Date) {
	const isTwoDayEvent = faker.number.float(1) < 0.1;
	if (!isTwoDayEvent) return [dateToDatabaseTimestamp(startTime)];

	const secondDay = new Date(startTime);
	secondDay.setDate(secondDay.getDate() + 1);

	return [
		dateToDatabaseTimestamp(startTime),
		dateToDatabaseTimestamp(secondDay),
	];
}

function fakeResults(users: SeededUsers, nzapId: number | null) {
	const placementCount = faker.helpers.arrayElement([1, 2, 3, 3, 3, 8]);
	const usedUserIds = new Set<number>();
	// spread over the placements, so his results are not all of the same podium spot
	const nzapPlacementIdx = faker.number.int({ max: placementCount - 1 });

	const drawUserId = () => {
		// weighted toward the showcase set so their result lists paginate
		const pool =
			faker.number.float(1) < 0.7
				? users.showcaseIds.slice(0, RESULT_TARGET_USER_RESULTS * 4)
				: users.crowdIds;
		const userId = faker.helpers.arrayElement(
			pool.filter((id) => !usedUserIds.has(id)),
		);
		usedUserIds.add(userId);

		return userId;
	};

	return Array.from({ length: placementCount }, (_, i) => ({
		placement: i + 1,
		teamName: showcaseNames.teamName(),
		players: [
			...(nzapId !== null && i === nzapPlacementIdx
				? [{ name: null, userId: nzapId }]
				: []),
			...Array.from(
				{ length: faker.helpers.arrayElement([1, 2, 3, 4, 4, 4, 5]) },
				() => {
					const isUnregisteredPlayer = faker.number.float(1) < 0.2;

					return isUnregisteredPlayer
						? { name: faker.person.firstName(), userId: null }
						: { name: null, userId: drawUserId() };
				},
			),
		],
	}));
}

import { dateToDatabaseTimestamp } from "~/utils/dates";
import { invariant } from "~/utils/invariant";
import { faker } from "../core/faker";
import * as showcaseNames from "../core/showcaseNames";
import * as CalendarEventFactory from "../factories/CalendarEventFactory";
import * as CalendarEventResultFactory from "../factories/CalendarEventResultFactory";
import * as CalendarEventVenueFactory from "../factories/CalendarEventVenueFactory";
import type { SeededBadges } from "./badges";
import type { SeededUsers } from "./users";

const EVENT_COUNT = 200;
const RESULT_TARGET_USER_RESULTS = 8;
/** Results N-ZAP is placed in, enough for his results page to paginate. */
const NZAP_RESULT_COUNT = 30;
/**
 * Venues of upcoming events, for the LAN map: spread over the continents, the two Paris ones and the two around Los
 * Angeles close enough to cluster when zoomed out.
 */
const LAN_MAP_VENUES: Array<
	Omit<Parameters<typeof CalendarEventVenueFactory.create>[0], "eventId">
> = [
	{
		name: "Paris Expo Porte de Versailles",
		address: "1 Place de la Porte de Versailles, 75015 Paris, France",
		city: "Paris",
		countryCode: "FR",
		latitude: 48.8325,
		longitude: 2.2875,
		timezone: "Europe/Paris",
	},
	{
		name: "Paris La Défense Arena",
		address: "99 Jardins de l'Arche, 92000 Nanterre, France",
		city: "Nanterre",
		countryCode: "FR",
		latitude: 48.8957,
		longitude: 2.2296,
		timezone: "Europe/Paris",
	},
	{
		name: "Los Angeles Convention Center",
		address: "1201 South Figueroa Street, 90015 Los Angeles, CA, United States",
		city: "Los Angeles",
		countryCode: "US",
		latitude: 34.0403,
		longitude: -118.2696,
		timezone: "America/Los_Angeles",
	},
	{
		name: "Anaheim Convention Center",
		address: "800 West Katella Avenue, 92802 Anaheim, CA, United States",
		city: "Anaheim",
		countryCode: "US",
		latitude: 33.8003,
		longitude: -117.9204,
		timezone: "America/Los_Angeles",
	},
	{
		name: "Metro Toronto Convention Centre",
		address: "255 Front Street West, M5V 2W6 Toronto, ON, Canada",
		city: "Toronto",
		countryCode: "CA",
		latitude: 43.6435,
		longitude: -79.3871,
		timezone: "America/Toronto",
	},
	{
		name: "Centro Citibanamex",
		address: "Avenida del Conscripto 311, 11200 Mexico City, Mexico",
		city: "Mexico City",
		countryCode: "MX",
		latitude: 19.4406,
		longitude: -99.2178,
		timezone: "America/Mexico_City",
	},
	{
		name: "São Paulo Expo",
		address: "Rodovia dos Imigrantes km 1.5, 04329-900 São Paulo, Brazil",
		city: "São Paulo",
		countryCode: "BR",
		latitude: -23.6489,
		longitude: -46.6225,
		timezone: "America/Sao_Paulo",
	},
	{
		name: "ExCeL London",
		address: "1 Western Gateway, E16 1XL London, United Kingdom",
		city: "London",
		countryCode: "GB",
		latitude: 51.5085,
		longitude: 0.0295,
		timezone: "Europe/London",
	},
	{
		name: "Koelnmesse",
		address: "Messeplatz 1, 50679 Köln, Germany",
		city: "Köln",
		countryCode: "DE",
		latitude: 50.9473,
		longitude: 6.9831,
		timezone: "Europe/Berlin",
	},
	{
		name: "Stockholmsmässan",
		address: "Mässvägen 1, 125 80 Älvsjö, Sweden",
		city: "Stockholm",
		countryCode: "SE",
		latitude: 59.2836,
		longitude: 18.0093,
		timezone: "Europe/Stockholm",
	},
	{
		name: "COEX",
		address: "513 Yeongdong-daero, 06164 Seoul, South Korea",
		city: "Seoul",
		countryCode: "KR",
		latitude: 37.5126,
		longitude: 127.059,
		timezone: "Asia/Seoul",
	},
	{
		name: "ICC Sydney",
		address: "14 Darling Drive, 2000 Sydney, NSW, Australia",
		city: "Sydney",
		countryCode: "AU",
		latitude: -33.8742,
		longitude: 151.199,
		timezone: "Australia/Sydney",
	},
];

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
	const upcomingEventIds: number[] = [];

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
		if (!isPast) upcomingEventIds.push(event.id);
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

	// after the loop so the venues' random values don't shift what the events were seeded with
	for (const [i, venue] of LAN_MAP_VENUES.entries()) {
		const eventId = upcomingEventIds[i];
		invariant(eventId, "Not enough upcoming events for the LAN map venues");

		await CalendarEventVenueFactory.create({ eventId, ...venue });
	}

	return { nzapResultTeamIds };
}

function nzapTeamId(
	teams: Awaited<ReturnType<typeof CalendarEventResultFactory.create>>["teams"],
	nzapId: number,
) {
	const team = teams.find((candidate) =>
		candidate.players.some((player) => player.id === nzapId),
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

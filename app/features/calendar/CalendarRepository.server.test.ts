import { sub } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as CalendarEventFactory from "~/db/seed/factories/CalendarEventFactory";
import * as ImageFactory from "~/db/seed/factories/ImageFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as CalendarRepository from "./CalendarRepository.server";

const users = UserFactory.pool();

describe("findRecentTournamentsByOrganizerUserId", () => {
	/** As many events as the dropdown has spots, so nothing is filled in. */
	const SPOTS_SHOWN = 10;

	const organizerId = () => users.id(1);

	beforeEach(async () => {
		await users.create(1);
	});

	const daysAgo = (days: number) =>
		dateToDatabaseTimestamp(sub(new Date(), { days }));

	const seedOrganizationWithSeries = (seriesNames: string[]) =>
		TournamentOrganizationFactory.create(
			{ ownerId: organizerId() },
			{
				series: seriesNames.map((name) => ({
					name,
					description: null,
					showLeaderboard: false,
				})),
			},
		);

	const seedTournament = ({
		name,
		startedDaysAgo,
		organizationId = null,
	}: {
		name: string;
		startedDaysAgo: number;
		organizationId?: number | null;
	}) =>
		TournamentFactory.create({
			authorId: organizerId(),
			organizationId,
			name,
			startTimes: [daysAgo(startedDaysAgo)],
		});

	/** Events of no series, newest first, starting from the given day. */
	const seedStandaloneTournaments = async ({
		count,
		organizationId,
		oldestStartedDaysAgo,
	}: {
		count: number;
		organizationId: number;
		oldestStartedDaysAgo: number;
	}) => {
		for (let index = 0; index < count; index++) {
			await seedTournament({
				name: `In The Zone ${index}`,
				startedDaysAgo: oldestStartedDaysAgo - index,
				organizationId,
			});
		}
	};

	const recentTournamentNames = async () => {
		const tournaments =
			await CalendarRepository.findRecentTournamentsByOrganizerUserId(
				organizerId(),
			);

		return tournaments.map((tournament) => tournament.name);
	};

	test("drops the older edition of a series when there are more events than spots", async () => {
		const org = await seedOrganizationWithSeries(["Low Ink"]);

		await seedTournament({
			name: "Low Ink February",
			startedDaysAgo: 1,
			organizationId: org.id,
		});
		await seedTournament({
			name: "Low Ink January",
			startedDaysAgo: 2,
			organizationId: org.id,
		});
		await seedStandaloneTournaments({
			count: SPOTS_SHOWN - 1,
			organizationId: org.id,
			oldestStartedDaysAgo: 11,
		});

		const names = await recentTournamentNames();

		expect(names).toHaveLength(SPOTS_SHOWN);
		expect(names).toContain("Low Ink February");
		expect(names).not.toContain("Low Ink January");
	});

	test("keeps the latest edition of an older series over the older edition of a newer one", async () => {
		const org = await seedOrganizationWithSeries(["Low Ink", "Paddling Pool"]);

		await seedTournament({
			name: "Low Ink February",
			startedDaysAgo: 1,
			organizationId: org.id,
		});
		await seedTournament({
			name: "Low Ink January",
			startedDaysAgo: 2,
			organizationId: org.id,
		});
		await seedStandaloneTournaments({
			count: SPOTS_SHOWN - 2,
			organizationId: org.id,
			oldestStartedDaysAgo: 11,
		});
		await seedTournament({
			name: "Paddling Pool October",
			startedDaysAgo: 100,
			organizationId: org.id,
		});

		const names = await recentTournamentNames();

		expect(names).toContain("Paddling Pool October");
		expect(names).not.toContain("Low Ink January");
	});

	test("fills the remaining spots with older editions of a series", async () => {
		const org = await seedOrganizationWithSeries(["Low Ink"]);

		await seedTournament({
			name: "Low Ink January",
			startedDaysAgo: 2,
			organizationId: org.id,
		});
		await seedTournament({
			name: "Low Ink February",
			startedDaysAgo: 1,
			organizationId: org.id,
		});

		expect(await recentTournamentNames()).toEqual([
			"Low Ink February",
			"Low Ink January",
		]);
	});

	test("keeps every event of an organization whose names match no series", async () => {
		const org = await seedOrganizationWithSeries(["Low Ink"]);

		await seedStandaloneTournaments({
			count: SPOTS_SHOWN + 1,
			organizationId: org.id,
			oldestStartedDaysAgo: 11,
		});

		expect(await recentTournamentNames()).toHaveLength(SPOTS_SHOWN);
	});

	test("excludes events that started over a year ago", async () => {
		const org = await seedOrganizationWithSeries(["Low Ink"]);

		await seedTournament({
			name: "Low Ink February",
			startedDaysAgo: 1,
			organizationId: org.id,
		});
		await seedTournament({
			name: "Low Ink January",
			startedDaysAgo: 400,
			organizationId: org.id,
		});

		expect(await recentTournamentNames()).toEqual(["Low Ink February"]);
	});

	test("includes events that belong to no organization", async () => {
		await seedTournament({ name: "Low Ink February", startedDaysAgo: 1 });

		expect(await recentTournamentNames()).toEqual(["Low Ink February"]);
	});
});

describe("findAvatarImgIds", () => {
	const authorId = () => users.id(1);

	beforeEach(async () => {
		await users.create(1);
	});

	test("returns the logos of the edited event and of the copied tournament's event", async () => {
		const copiedLogo = await ImageFactory.create({
			submitterUserId: authorId(),
		});
		const tournamentToCopy = await TournamentFactory.create({
			authorId: authorId(),
			avatarImgId: copiedLogo.id,
		});
		const editedLogo = await ImageFactory.create({
			submitterUserId: authorId(),
		});
		const eventToEdit = await CalendarEventFactory.create({
			authorId: authorId(),
			avatarImgId: editedLogo.id,
		});
		await CalendarEventFactory.create({
			authorId: authorId(),
			hasAvatar: true,
		});

		const imgIds = await CalendarRepository.findAvatarImgIds({
			eventId: eventToEdit.id,
			tournamentId: tournamentToCopy.id,
		});

		expect(imgIds.toSorted((a, b) => a - b)).toEqual(
			[copiedLogo.id, editedLogo.id].toSorted((a, b) => a - b),
		);
	});

	test("returns nothing when neither an event nor a tournament is given", async () => {
		await CalendarEventFactory.create({
			authorId: authorId(),
			hasAvatar: true,
		});

		expect(await CalendarRepository.findAvatarImgIds({})).toEqual([]);
	});
});

describe("findAllBetweenTwoTimestamps", () => {
	const authorId = () => users.id(1);

	beforeEach(async () => {
		await users.create(1);
	});

	test("tags only leagues with the virtual LEAGUE tag, ahead of their own tags", async () => {
		await TournamentFactory.create(
			{ authorId: authorId(), name: "League", tags: ["SPECIAL"] },
			{ isLeague: true },
		);
		await TournamentFactory.create({
			authorId: authorId(),
			name: "Tournament",
			tags: ["SPECIAL"],
		});

		const days = await CalendarRepository.findAllBetweenTwoTimestamps({
			startTime: sub(new Date(), { hours: 1 }),
			endTime: new Date(Date.now() + 60 * 60 * 1000),
		});
		const tagsOf = (name: string) =>
			days.flatMap((day) => day.events).find((event) => event.name === name)
				?.tags;

		expect(tagsOf("League")).toEqual(["LEAGUE", "SPECIAL"]);
		expect(tagsOf("Tournament")).toEqual(["SPECIAL"]);
	});
});

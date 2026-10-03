import { sub } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as BadgeFactory from "~/db/seed/factories/BadgeFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as TrophyFactory from "~/db/seed/factories/TrophyFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import type * as Progression from "~/features/tournament-bracket/core/Progression";
import * as TournamentOrganizationSeriesRepository from "~/features/tournament-organization/TournamentOrganizationSeriesRepository.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as TrophyBackfill from "./TrophyBackfill.server";

const SINGLE_BRACKET: Progression.ParsedBracket[] = [
	{
		name: "Main Bracket",
		type: "single_elimination",
		settings: {},
		requiresCheckIn: false,
	},
];

const TWO_STARTING_BRACKETS: Progression.ParsedBracket[] = [
	{
		name: "Division 1",
		type: "single_elimination",
		settings: {},
		requiresCheckIn: false,
	},
	{
		name: "Division 2",
		type: "single_elimination",
		settings: {},
		requiresCheckIn: false,
	},
];

const AB_DIVISIONS_FINALS: Progression.ParsedBracket[] = [
	{
		name: "Finals",
		type: "round_robin",
		settings: { hasAbDivisions: true },
		requiresCheckIn: false,
	},
];

const placer = (
	userId: number,
	div: string | null,
	setResults: Array<"W" | "L" | null> = ["W"],
) => ({ userId, div, setResults });

describe("TrophyBackfill.eligibleWinners", () => {
	test.each([
		{
			why: "every first placer without divisions",
			bracketProgression: SINGLE_BRACKET,
			firstPlacers: [placer(1, null), placer(2, null)],
			expected: [1, 2],
		},
		{
			why: "the first starting bracket's division",
			bracketProgression: TWO_STARTING_BRACKETS,
			firstPlacers: [placer(1, "Division 1"), placer(2, "Division 2")],
			expected: [1],
		},
		{
			why: "the A division of A/B division finals",
			bracketProgression: AB_DIVISIONS_FINALS,
			firstPlacers: [placer(1, "B"), placer(2, "A")],
			expected: [2],
		},
		{
			why: "no one when the top division has no winners",
			bracketProgression: TWO_STARTING_BRACKETS,
			firstPlacers: [placer(1, "Division 2")],
			expected: [],
		},
		{
			why: "no one who didn't play a single set",
			bracketProgression: SINGLE_BRACKET,
			firstPlacers: [
				placer(1, null, ["W", null]),
				placer(2, null, [null, null]),
				placer(3, null, []),
			],
			expected: [1],
		},
	])("picks $why", ({ bracketProgression, firstPlacers, expected }) => {
		expect(
			TrophyBackfill.eligibleWinners({ firstPlacers, bracketProgression }).map(
				(winner) => winner.userId,
			),
		).toEqual(expected);
	});
});

describe("TrophyBackfill.backfillableTournaments", () => {
	const users = UserFactory.pool();
	const organizerId = () => users.id(1);
	const winnerIds = () => users.ids(9).slice(1, 5);
	const benchedWinnerId = () => users.id(6);
	const loserRoster = () => users.ids(9).slice(6, 9);

	let organizationId: number;
	let seriesId: number;

	beforeEach(async () => {
		await users.create(9);

		const organization = await TournamentOrganizationFactory.create(
			{ ownerId: organizerId() },
			{
				series: [
					{ name: "Weekly Cup", description: null, showLeaderboard: false },
				],
			},
		);
		organizationId = organization.id;

		const [series] = await TournamentOrganizationSeriesRepository.series()
			.where({ organizationId })
			.execute();
		seriesId = series.id;
	});

	const createFinalized = (
		overrides: Partial<Parameters<typeof TournamentFactory.create>[0]> = {},
	) =>
		TournamentFactory.createPlayed(
			{
				authorId: organizerId(),
				name: "Weekly Cup #1",
				organizationId,
				...overrides,
			},
			{
				teamRosters: [
					[...winnerIds(), benchedWinnerId()],
					[organizerId(), ...loserRoster()],
				],
				playedOut: "all",
			},
		);

	const backfillable = () =>
		TrophyBackfill.backfillableTournaments({ organizationId, seriesId });

	test("lists a finalized tournament of the series with its winners who played", async () => {
		const tournament = await createFinalized();

		const tournaments = await backfillable();

		expect(tournaments).toHaveLength(1);
		expect(tournaments?.[0]).toMatchObject({
			tournamentId: tournament.id,
			name: "Weekly Cup #1",
			tournamentTeamId: tournament.teams[0].id,
		});
		expect(tournaments?.[0].winners.map((winner) => winner.id)).toEqual(
			winnerIds(),
		);
	});

	test("lists a tournament whose winners already got a badge", async () => {
		const badge = await BadgeFactory.create();
		await createFinalized({ badges: [badge.id] });

		expect(await backfillable()).toHaveLength(1);
	});

	test("skips a tournament that already has a trophy", async () => {
		const trophy = await TrophyFactory.create({ organizationId });
		await createFinalized({ trophyId: trophy.id });

		expect(await backfillable()).toEqual([]);
	});

	test("skips a tournament outside of the series", async () => {
		await createFinalized({ name: "Monthly Showdown" });

		expect(await backfillable()).toEqual([]);
	});

	test("skips a tournament of another organization", async () => {
		const otherOrganization = await TournamentOrganizationFactory.create({
			ownerId: organizerId(),
		});
		await createFinalized({ organizationId: otherOrganization.id });

		expect(await backfillable()).toEqual([]);
	});

	test("skips a test tournament", async () => {
		await createFinalized({ isTest: true });

		expect(await backfillable()).toEqual([]);
	});

	test("skips a tournament that is not finalized", async () => {
		await TournamentFactory.createPlayed(
			{ authorId: organizerId(), name: "Weekly Cup #2", organizationId },
			{
				teamRosters: [winnerIds(), [organizerId(), ...loserRoster()]],
			},
		);

		expect(await backfillable()).toEqual([]);
	});

	test("lists newest tournaments first", async () => {
		const older = await createFinalized({
			name: "Weekly Cup #1",
			startTimes: [daysAgoTimestamp(14)],
		});
		const newer = await createFinalized({
			name: "Weekly Cup #2",
			startTimes: [daysAgoTimestamp(7)],
		});

		expect(
			(await backfillable())?.map((tournament) => tournament.tournamentId),
		).toEqual([newer.id, older.id]);
	});

	test("is null for a series of another organization", async () => {
		const otherOrganization = await TournamentOrganizationFactory.create(
			{ ownerId: organizerId() },
			{
				series: [
					{ name: "Other Cup", description: null, showLeaderboard: false },
				],
			},
		);
		const [otherSeries] = await TournamentOrganizationSeriesRepository.series()
			.where({ organizationId: otherOrganization.id })
			.execute();

		expect(
			await TrophyBackfill.backfillableTournaments({
				organizationId,
				seriesId: otherSeries.id,
			}),
		).toBe(null);
	});
});

function daysAgoTimestamp(days: number) {
	return dateToDatabaseTimestamp(sub(new Date(), { days }));
}

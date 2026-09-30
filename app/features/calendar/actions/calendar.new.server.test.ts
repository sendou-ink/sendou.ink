import { addDays } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as BadgeFactory from "~/db/seed/factories/BadgeFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { invariant } from "~/utils/invariant";
import { wrappedAction } from "~/utils/Test";
import type { calendarNewSchemaServer } from "../calendar-new-schemas.server";
import { calendarNewFormValues } from "../tests/fixtures";
import { action } from "./calendar.new.server";

const editAction = wrappedAction<typeof calendarNewSchemaServer>({
	action,
	isJsonSubmission: true,
});

const users = UserFactory.pool();

const badgeManagingAuthorId = () => users.id(1);
const teamPickAuthorId = () => users.id(5);
const teamPickTeamMemberIds = () => users.ids(4);

describe("calendar new action: editing an event with badge prizes", () => {
	let orgAdminId: number;

	beforeEach(async () => {
		orgAdminId = (await UserFactory.createRegular()).id;
		await users.create(1);
	});

	const seedTournamentWithBadge = async () => {
		const org = await TournamentOrganizationFactory.create(
			{ ownerId: orgAdminId },
			{
				isEstablished: true,
				members: [{ userId: badgeManagingAuthorId(), role: "ADMIN" }],
			},
		);
		const badge = await BadgeFactory.create(null, {
			managerIds: [badgeManagingAuthorId()],
		});
		const tournament = await TournamentFactory.create({
			authorId: badgeManagingAuthorId(),
			organizationId: org.id,
			name: "Low Ink",
			badges: [badge.id],
		});

		return { org, badge, tournament };
	};

	const editFields = ({
		eventId,
		organizationId,
		badgeIds,
	}: {
		eventId: number;
		organizationId: number;
		badgeIds: number[];
	}) =>
		calendarNewFormValues({
			eventToEditId: eventId,
			name: "Low Ink (edited)",
			organizationId: String(organizationId),
			bracketUrl: "https://sendou.ink",
			badges: badgeIds,
		});

	const badgePrizeIds = async (eventId: number) =>
		(
			await CalendarRepository.findById(eventId, { includeBadgePrizes: true })
		)?.badgePrizes?.map((badge) => badge.id);

	test("org admin editing keeps the badge the author attached", async () => {
		const { org, badge, tournament } = await seedTournamentWithBadge();

		await editAction(
			editFields({
				eventId: tournament.eventId,
				organizationId: org.id,
				badgeIds: [badge.id],
			}),
			{ user: "regular" },
		);

		const edited = await CalendarRepository.findById(tournament.eventId, {
			includeBadgePrizes: true,
		});
		expect(edited?.name).toBe("Low Ink (edited)");
		expect(edited?.badgePrizes?.map((prize) => prize.id)).toEqual([badge.id]);
	});

	test("badge managing author editing keeps the badge", async () => {
		const { org, badge, tournament } = await seedTournamentWithBadge();

		await editAction(
			editFields({
				eventId: tournament.eventId,
				organizationId: org.id,
				badgeIds: [badge.id],
			}),
			{ user: badgeManagingAuthorId() },
		);

		expect(await badgePrizeIds(tournament.eventId)).toEqual([badge.id]);
	});
});

describe("calendar new action: bracket URL", () => {
	beforeEach(async () => {
		await UserFactory.createRegular(null, { roles: ["TOURNAMENT_ORGANIZER"] });
	});

	const newEventFields = (
		overrides: Partial<Parameters<typeof editAction>[0]>,
	) =>
		calendarNewFormValues({
			toToolsEnabled: false,
			date: [addDays(new Date(), 7).toISOString() as never],
			startTime: null,
			...overrides,
		});

	test.each([
		{
			why: "missing",
			bracketUrl: "",
			expectedError: "forms:errors.bracketUrlRequired",
		},
		{
			why: "javascript: protocol",
			bracketUrl: "javascript:alert(1)",
			expectedError: "forms:errors.invalidUrl",
		},
	])("rejects bracket URL ($why)", async ({ bracketUrl, expectedError }) => {
		const res = await editAction(newEventFields({ bracketUrl }), {
			user: "regular",
		});

		expect(res.fieldErrors.bracketUrl).toBe(expectedError);
	});

	test("tournament with no bracket URL gets the default one", async () => {
		const res = await editAction(
			newEventFields({
				toToolsEnabled: true,
				date: [],
				startTime: addDays(new Date(), 7).toISOString() as never,
			}),
			{ user: "regular" },
		);

		expect(res.fieldErrors).toBeUndefined();

		const location =
			res instanceof Response ? res.headers.get("Location") : null;
		invariant(location, "expected a redirect to the created event");

		const created = await CalendarRepository.findById(
			Number(location.split("/").at(-1)),
		);
		expect(created?.bracketUrl).toBe("https://sendou.ink");
	});
});

describe("calendar new action: team picked tournament", () => {
	beforeEach(async () => {
		await UserFactory.createRegular(null, { roles: ["TOURNAMENT_ORGANIZER"] });
		await users.create(5);
	});

	test("saves the team pick settings and the custom pool", async () => {
		const customPool = new MapPool({
			...MapPool.EMPTY.parsed,
			SZ: [1, 2, 3, 4, 5],
			TC: [6, 7, 8],
		});

		const res = await editAction(
			calendarNewFormValues({
				mapPickingStyle: "AUTO",
				teamPickModes: ["TC", "SZ"],
				teamPickCounts: [{ mode: "TC", count: 2 }],
				teamPickPool: "CUSTOM",
				pool: customPool.serialized,
			}),
			{ user: "regular" },
		);

		expect(res.fieldErrors).toBeUndefined();

		const location =
			res instanceof Response ? res.headers.get("Location") : null;
		invariant(location, "expected a redirect to the created event");

		const created = await CalendarRepository.findById(
			Number(location.split("/").at(-1)),
		);
		invariant(created?.tournamentId, "expected a tournament to be created");

		const tournament = await tournamentFromDB(created.tournamentId);
		expect(tournament.teamPickSettings).toEqual({
			modes: [
				{ mode: "SZ", count: 4 },
				{ mode: "TC", count: 2 },
			],
			pool: "CUSTOM",
		});
		expect(new MapPool(tournament.ctx.toSetMapPool).serialized).toBe(
			customPool.serialized,
		);
	});

	test("changing the pick settings resets the teams' picks and checks them out", async () => {
		const tournament = await TournamentFactory.create({
			authorId: teamPickAuthorId(),
			mapPickingStyle: "AUTO",
			teamPick: { modes: [{ mode: "SZ", count: 2 }], pool: "ALL" },
		});
		await TournamentTeamFactory.create(
			{
				tournamentId: tournament.id,
				memberUserIds: teamPickTeamMemberIds(),
				mapPool: new MapPool({ ...MapPool.EMPTY.parsed, SZ: [1, 2] }),
			},
			{ isCheckedIn: true },
		);

		const res = await editAction(
			calendarNewFormValues({
				eventToEditId: tournament.eventId,
				bracketUrl: "https://sendou.ink",
				mapPickingStyle: "AUTO",
				teamPickModes: ["SZ"],
				teamPickCounts: [{ mode: "SZ", count: 3 }],
				teamPickPool: "ALL",
			}),
			{ user: teamPickAuthorId() },
		);
		expect(res.fieldErrors).toBeUndefined();

		const edited = await tournamentFromDB(tournament.id);
		expect(edited.ctx.teams[0].hasMapPool).toBe(0);
		expect(edited.ctx.teams[0].checkIns).toEqual([]);
	});
});

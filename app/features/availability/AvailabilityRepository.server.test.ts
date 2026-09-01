import { beforeEach, describe, expect, test } from "vitest";
import { actAs } from "~/db/seed/core/actAs";
import * as AvailabilityWeekFactory from "~/db/seed/factories/AvailabilityWeekFactory";
import * as TeamEventFactory from "~/db/seed/factories/TeamEventFactory";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as AvailabilityRepository from "./AvailabilityRepository.server";
import * as Availability from "./core/Availability";

const users = UserFactory.pool();

const TIMEZONE = "Europe/Helsinki";

const at = (date: string, time: string) =>
	Availability.localToTimestamp({ date, time, timezone: TIMEZONE });

const WEEK_STARTS_AT = at("2026-08-24", "00:00");
const NEXT_WEEK_STARTS_AT = at("2026-08-31", "00:00");

const WINDOW = {
	startsAt: WEEK_STARTS_AT,
	endsAt: NEXT_WEEK_STARTS_AT,
};

const weeksOf = (userId: number) =>
	AvailabilityRepository.findAllWeeksByUserIds({
		userIds: [userId],
		...WINDOW,
	});

describe("AvailabilityRepository.upsertOwnWeek", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("saves the week with its slots and day notes", async () => {
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: WEEK_STARTS_AT,
			timezone: TIMEZONE,
			slots: [
				{
					startsAt: at("2026-08-24", "18:00"),
					endsAt: at("2026-08-24", "22:00"),
				},
			],
			dayNotes: [{ date: "2026-08-24", text: "Have to stop earlier" }],
		});

		const [week] = await weeksOf(users.id(1));

		expect(week.timezone).toBe(TIMEZONE);
		expect(week.slots).toEqual([
			{
				startsAt: at("2026-08-24", "18:00"),
				endsAt: at("2026-08-24", "22:00"),
			},
		]);
		expect(week.dayNotes).toEqual([
			{ date: "2026-08-24", text: "Have to stop earlier" },
		]);
	});

	test("replaces the slots and day notes the week had before", async () => {
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: WEEK_STARTS_AT,
			slots: [
				{
					startsAt: at("2026-08-24", "18:00"),
					endsAt: at("2026-08-24", "22:00"),
				},
			],
			dayNotes: [{ date: "2026-08-24", text: "Have to stop earlier" }],
		});

		await actAs(users.id(1), () =>
			AvailabilityRepository.upsertOwnWeek({
				weekStartsAt: WEEK_STARTS_AT,
				timezone: TIMEZONE,
				slots: [
					{
						startsAt: at("2026-08-25", "19:00"),
						endsAt: at("2026-08-25", "23:00"),
					},
				],
				dayNotes: [],
			}),
		);

		const weeks = await weeksOf(users.id(1));

		expect(weeks).toHaveLength(1);
		expect(weeks[0].slots).toEqual([
			{
				startsAt: at("2026-08-25", "19:00"),
				endsAt: at("2026-08-25", "23:00"),
			},
		]);
		expect(weeks[0].dayNotes).toEqual([]);
	});

	test("keeps a submitted week with no slots, which is how being unavailable all week is reported", async () => {
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: WEEK_STARTS_AT,
		});

		const weeks = await weeksOf(users.id(1));

		expect(weeks).toHaveLength(1);
		expect(weeks[0].slots).toEqual([]);
	});

	test("replaces the same week reported earlier from another timezone instead of duplicating it", async () => {
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: WEEK_STARTS_AT,
			timezone: TIMEZONE,
			slots: [
				{
					startsAt: at("2026-08-24", "18:00"),
					endsAt: at("2026-08-24", "22:00"),
				},
			],
		});

		const newYorkWeekStartsAt = Availability.localToTimestamp({
			date: "2026-08-24",
			time: "00:00",
			timezone: "America/New_York",
		});
		await actAs(users.id(1), () =>
			AvailabilityRepository.upsertOwnWeek({
				weekStartsAt: newYorkWeekStartsAt,
				timezone: "America/New_York",
				slots: [
					{
						startsAt: at("2026-08-26", "19:00"),
						endsAt: at("2026-08-26", "21:00"),
					},
				],
				dayNotes: [],
			}),
		);

		const weeks = await weeksOf(users.id(1));

		expect(weeks).toHaveLength(1);
		expect(weeks[0].weekStartsAt).toBe(newYorkWeekStartsAt);
		expect(weeks[0].timezone).toBe("America/New_York");
		expect(weeks[0].slots).toEqual([
			{
				startsAt: at("2026-08-26", "19:00"),
				endsAt: at("2026-08-26", "21:00"),
			},
		]);
	});

	test("saves each user's week of their own", async () => {
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: WEEK_STARTS_AT,
		});
		await AvailabilityWeekFactory.create({
			userId: users.id(2),
			weekStartsAt: WEEK_STARTS_AT,
		});

		const weeks = await AvailabilityRepository.findAllWeeksByUserIds({
			userIds: [users.id(1), users.id(2)],
			...WINDOW,
		});

		expect(weeks.map((week) => week.userId).sort()).toEqual(
			[users.id(1), users.id(2)].sort(),
		);
	});
});

describe("AvailabilityRepository.findAllWeeksByUserIds", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("leaves out weeks outside the window", async () => {
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: NEXT_WEEK_STARTS_AT,
		});

		expect(await weeksOf(users.id(1))).toEqual([]);
	});

	test("finds a week reported in a timezone whose Monday starts on the window's Sunday", async () => {
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: Availability.weekStartsAt(
				new Date(at("2026-08-26", "12:00") * 1000),
				"Asia/Tokyo",
			),
			timezone: "Asia/Tokyo",
		});

		expect(await weeksOf(users.id(1))).toHaveLength(1);
	});
});

describe("AvailabilityRepository.deleteWeeksStartedBefore", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("deletes only the weeks that started before the cutoff", async () => {
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: WEEK_STARTS_AT,
			slots: [
				{
					startsAt: at("2026-08-24", "18:00"),
					endsAt: at("2026-08-24", "22:00"),
				},
			],
		});
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: NEXT_WEEK_STARTS_AT,
		});

		await AvailabilityRepository.deleteWeeksStartedBefore(NEXT_WEEK_STARTS_AT);

		expect(await weeksOf(users.id(1))).toEqual([]);
		expect(
			await AvailabilityRepository.findAllWeeksByUserIds({
				userIds: [users.id(1)],
				startsAt: NEXT_WEEK_STARTS_AT,
				endsAt: at("2026-09-07", "00:00"),
			}),
		).toHaveLength(1);
	});
});

describe("AvailabilityRepository.hasReportedWeek", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("finds the week even when it was reported in another timezone", async () => {
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: Availability.weekStartsAt(
				new Date(WEEK_STARTS_AT * 1000 + 3 * 24 * 60 * 60 * 1000),
				"Asia/Tokyo",
			),
			timezone: "Asia/Tokyo",
		});

		expect(
			await AvailabilityRepository.hasReportedWeek({
				userId: users.id(1),
				weekStartsAt: WEEK_STARTS_AT,
			}),
		).toBe(true);
	});

	test("does not confuse a neighbouring week for the asked one", async () => {
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: NEXT_WEEK_STARTS_AT,
		});

		expect(
			await AvailabilityRepository.hasReportedWeek({
				userId: users.id(1),
				weekStartsAt: WEEK_STARTS_AT,
			}),
		).toBe(false);
	});
});

describe("AvailabilityRepository.findWeekReminderUserIds", () => {
	beforeEach(async () => {
		await users.create(4);
	});

	const reminderUserIds = () =>
		AvailabilityRepository.findWeekReminderUserIds(WEEK_STARTS_AT);

	test("reminds the members whose teammate reported the week", async () => {
		await TeamFactory.create({
			memberUserIds: [users.id(1), users.id(2), users.id(3)],
		});
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: WEEK_STARTS_AT,
		});

		expect(await reminderUserIds()).toEqual([users.id(2), users.id(3)]);
	});

	test("reminds nobody on a team where nobody reported the week", async () => {
		await TeamFactory.create({ memberUserIds: [users.id(1), users.id(2)] });
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: NEXT_WEEK_STARTS_AT,
		});

		expect(await reminderUserIds()).toEqual([]);
	});

	test("reminds a user once even when several of their teams qualify", async () => {
		await TeamFactory.create({ memberUserIds: [users.id(1), users.id(3)] });
		await TeamFactory.create({
			memberUserIds: [users.id(2), users.id(3)],
			isMainTeam: false,
		});
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: WEEK_STARTS_AT,
		});
		await AvailabilityWeekFactory.create({
			userId: users.id(2),
			weekStartsAt: WEEK_STARTS_AT,
		});

		expect(await reminderUserIds()).toEqual([users.id(3)]);
	});

	test("leaves users without a team out", async () => {
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: WEEK_STARTS_AT,
		});

		expect(await reminderUserIds()).toEqual([]);
	});

	test("leaves cheerleaders out, the schedule surfaces do not show them", async () => {
		await TeamFactory.create(
			{ memberUserIds: [users.id(1), users.id(2), users.id(3)] },
			{ roles: { [users.id(3)]: "CHEERLEADER" } },
		);
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: WEEK_STARTS_AT,
		});

		expect(await reminderUserIds()).toEqual([users.id(2)]);
	});
});

describe("AvailabilityRepository.findTeamEventsByTeamId", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("finds only the team's events overlapping the window", async () => {
		const team = await TeamFactory.create({
			name: "Alpha",
			memberUserIds: [users.id(1)],
		});
		const otherTeam = await TeamFactory.create({
			name: "Bravo",
			memberUserIds: [users.id(2)],
		});

		await TeamEventFactory.create({
			teamId: team.id,
			authorId: users.id(1),
			name: "VoD review",
			startsAt: at("2026-08-25", "20:00"),
			endsAt: at("2026-08-25", "21:30"),
		});
		await TeamEventFactory.create({
			teamId: team.id,
			authorId: users.id(1),
			name: "Next week meeting",
			startsAt: at("2026-09-01", "19:00"),
			endsAt: at("2026-09-01", "20:00"),
		});
		await TeamEventFactory.create({
			teamId: otherTeam.id,
			authorId: users.id(2),
			name: "Bravo scrim block",
			startsAt: at("2026-08-25", "20:00"),
			endsAt: at("2026-08-25", "21:00"),
		});

		const events = await AvailabilityRepository.findTeamEventsByTeamId({
			teamId: team.id,
			...WINDOW,
		});

		expect(events).toHaveLength(1);
		expect(events[0].name).toBe("VoD review");
	});

	test("returns the participants of an event limited to selected members, empty for a whole-team event", async () => {
		const team = await TeamFactory.create({
			name: "Alpha",
			memberUserIds: [users.id(1), users.id(2)],
		});

		await TeamEventFactory.create({
			teamId: team.id,
			authorId: users.id(1),
			name: "Whole team",
			startsAt: at("2026-08-25", "20:00"),
			endsAt: at("2026-08-25", "21:00"),
		});
		await TeamEventFactory.create({
			teamId: team.id,
			authorId: users.id(1),
			name: "Selected only",
			startsAt: at("2026-08-26", "20:00"),
			endsAt: at("2026-08-26", "21:00"),
			participantUserIds: [users.id(2)],
		});

		const events = await AvailabilityRepository.findTeamEventsByTeamId({
			teamId: team.id,
			...WINDOW,
		});

		expect(events).toHaveLength(2);
		expect(events[0].participants).toEqual([]);
		expect(events[1].participants).toEqual([{ userId: users.id(2) }]);
	});
});

describe("AvailabilityRepository.findAllTeamEventsByUserIds", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("an event limited to selected members produces rows only for them", async () => {
		const team = await TeamFactory.create({
			name: "Alpha",
			memberUserIds: [users.id(1), users.id(2)],
		});

		await TeamEventFactory.create({
			teamId: team.id,
			authorId: users.id(1),
			name: "Whole team",
			startsAt: at("2026-08-25", "20:00"),
			endsAt: at("2026-08-25", "21:00"),
		});
		await TeamEventFactory.create({
			teamId: team.id,
			authorId: users.id(1),
			name: "Selected only",
			startsAt: at("2026-08-26", "20:00"),
			endsAt: at("2026-08-26", "21:00"),
			participantUserIds: [users.id(2)],
		});

		const events = await AvailabilityRepository.findAllTeamEventsByUserIds({
			userIds: [users.id(1), users.id(2)],
			...WINDOW,
		});

		expect(
			events.filter((event) => event.userId === users.id(1)).map((e) => e.name),
		).toEqual(["Whole team"]);
		expect(
			events
				.filter((event) => event.userId === users.id(2))
				.map((e) => e.name)
				.sort(),
		).toEqual(["Selected only", "Whole team"]);
	});
});

describe("AvailabilityRepository.findAllUpcomingTeamEventsByUserId", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("finds the events of every team the user is a member of, with the owning team attached", async () => {
		const ownTeam = await TeamFactory.create({
			name: "Alpha",
			memberUserIds: [users.id(1)],
		});
		const otherTeam = await TeamFactory.create({
			name: "Bravo",
			memberUserIds: [users.id(2)],
		});

		await TeamEventFactory.create({
			teamId: ownTeam.id,
			authorId: users.id(1),
			name: "VoD review",
			startsAt: at("2026-08-25", "20:00"),
			endsAt: at("2026-08-25", "21:30"),
		});
		await TeamEventFactory.create({
			teamId: otherTeam.id,
			authorId: users.id(2),
			name: "Bravo meeting",
			startsAt: at("2026-08-25", "20:00"),
			endsAt: at("2026-08-25", "21:00"),
		});

		const events =
			await AvailabilityRepository.findAllUpcomingTeamEventsByUserId({
				userId: users.id(1),
				...WINDOW,
			});

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			name: "VoD review",
			teamName: "Alpha",
			teamCustomUrl: "alpha",
		});
	});

	test("leaves out events that ended before the window", async () => {
		const team = await TeamFactory.create({
			name: "Alpha",
			memberUserIds: [users.id(1)],
		});

		await TeamEventFactory.create({
			teamId: team.id,
			authorId: users.id(1),
			name: "Past event",
			startsAt: at("2026-08-17", "20:00"),
			endsAt: at("2026-08-17", "21:00"),
		});

		expect(
			await AvailabilityRepository.findAllUpcomingTeamEventsByUserId({
				userId: users.id(1),
				...WINDOW,
			}),
		).toEqual([]);
	});

	test("leaves out an event limited to selected members the user is not one of", async () => {
		const team = await TeamFactory.create({
			name: "Alpha",
			memberUserIds: [users.id(1), users.id(2)],
		});

		await TeamEventFactory.create({
			teamId: team.id,
			authorId: users.id(1),
			name: "Selected only",
			startsAt: at("2026-08-25", "20:00"),
			endsAt: at("2026-08-25", "21:00"),
			participantUserIds: [users.id(2)],
		});

		expect(
			await AvailabilityRepository.findAllUpcomingTeamEventsByUserId({
				userId: users.id(1),
				...WINDOW,
			}),
		).toEqual([]);
		expect(
			await AvailabilityRepository.findAllUpcomingTeamEventsByUserId({
				userId: users.id(2),
				...WINDOW,
			}),
		).toHaveLength(1);
	});
});

describe("AvailabilityRepository.updateTeamEvent", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("updates the event and replaces its participant limitation", async () => {
		const team = await TeamFactory.create({
			name: "Alpha",
			memberUserIds: [users.id(1), users.id(2)],
		});
		const event = await TeamEventFactory.create({
			teamId: team.id,
			authorId: users.id(1),
			name: "VoD review",
			startsAt: at("2026-08-25", "20:00"),
			endsAt: at("2026-08-25", "21:00"),
		});

		await AvailabilityRepository.updateTeamEvent({
			id: event.id,
			name: "Scrim review",
			startsAt: at("2026-08-26", "19:00"),
			endsAt: at("2026-08-26", "20:30"),
			participantUserIds: [users.id(2)],
		});

		const [updated] = await AvailabilityRepository.findTeamEventsByTeamId({
			teamId: team.id,
			...WINDOW,
		});

		expect(updated).toMatchObject({
			name: "Scrim review",
			startsAt: at("2026-08-26", "19:00"),
			endsAt: at("2026-08-26", "20:30"),
			participants: [{ userId: users.id(2) }],
		});
	});

	test("clears the participant limitation when updated back to the whole team", async () => {
		const team = await TeamFactory.create({
			name: "Alpha",
			memberUserIds: [users.id(1), users.id(2)],
		});
		const event = await TeamEventFactory.create({
			teamId: team.id,
			authorId: users.id(1),
			name: "VoD review",
			startsAt: at("2026-08-25", "20:00"),
			endsAt: at("2026-08-25", "21:00"),
			participantUserIds: [users.id(2)],
		});

		await AvailabilityRepository.updateTeamEvent({
			id: event.id,
			name: "VoD review",
			startsAt: at("2026-08-25", "20:00"),
			endsAt: at("2026-08-25", "21:00"),
		});

		const [updated] = await AvailabilityRepository.findTeamEventsByTeamId({
			teamId: team.id,
			...WINDOW,
		});

		expect(updated.participants).toEqual([]);
	});
});

describe("AvailabilityRepository.deleteTeamEvent", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("deletes the event", async () => {
		const team = await TeamFactory.create({
			name: "Alpha",
			memberUserIds: [users.id(1)],
		});
		const event = await TeamEventFactory.create({
			teamId: team.id,
			authorId: users.id(1),
			name: "VoD review",
			startsAt: at("2026-08-25", "20:00"),
			endsAt: at("2026-08-25", "21:30"),
		});

		await AvailabilityRepository.deleteTeamEvent(event.id);

		expect(
			await AvailabilityRepository.findTeamEventsByTeamId({
				teamId: team.id,
				...WINDOW,
			}),
		).toEqual([]);
	});
});

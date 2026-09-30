import { addWeeks } from "date-fns";
import * as R from "remeda";
import { describe, expect, test } from "vitest";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { assertResponseErrored, wrappedAction } from "~/utils/Test";
import * as AvailabilityRepository from "../AvailabilityRepository.server";
import { SCHEDULE_VISIBILITY_FRIENDS_VALUE } from "../availability-constants";
import type {
	saveScheduleVisibilitySchema,
	saveWeekSchema,
} from "../availability-schemas";
import * as Availability from "../core/Availability";
import { action as eventsAction } from "./events.server";

const DAY_SECONDS = 24 * 60 * 60;
// the action has no request timezone in tests, so it falls back to UTC
const TIMEZONE = "UTC";

const saveWeek = wrappedAction<typeof saveWeekSchema>({
	action: eventsAction,
	isJsonSubmission: true,
});

const saveScheduleVisibility = wrappedAction<
	typeof saveScheduleVisibilitySchema
>({ action: eventsAction, isJsonSubmission: true });

const weekDays = (weeksFromNow: number) => {
	const weekStartsAt = Availability.weekStartsAt(
		addWeeks(new Date(), weeksFromNow),
		TIMEZONE,
	);

	return R.range(0, 7).map((dayIndex) => ({
		date: Availability.dateInTimezone(
			weekStartsAt + dayIndex * DAY_SECONDS + DAY_SECONDS / 2,
			TIMEZONE,
		),
		ranges: [],
		note: "",
	}));
};

describe("events action: SAVE_WEEK", () => {
	test("saves the current week", async () => {
		const user = await UserFactory.createRegular();

		const response = await saveWeek(
			{ _action: "SAVE_WEEK", days: weekDays(0) },
			{ user: "regular" },
		);

		expect(response).toBeNull();
		expect(
			await AvailabilityRepository.hasReportedWeek({
				userId: user.id,
				weekStartsAt: Availability.weekStartsAt(new Date(), TIMEZONE),
			}),
		).toBe(true);
	});

	test.each([
		{ why: "a week before the current one", weeksFromNow: -1 },
		{ why: "a week past the horizon", weeksFromNow: 2 },
	])("rejects $why", async ({ weeksFromNow }) => {
		await UserFactory.createRegular();

		const response = await saveWeek(
			{ _action: "SAVE_WEEK", days: weekDays(weeksFromNow) },
			{ user: "regular" },
		);

		assertResponseErrored(
			response,
			"Only the current and the next week can be saved",
		);
	});

	test("rejects days that do not form one week", async () => {
		await UserFactory.createRegular();
		const days = weekDays(0);

		const response = await saveWeek(
			{
				_action: "SAVE_WEEK",
				days: [...days.slice(0, 6), { ...days[6], date: days[0].date }],
			},
			{ user: "regular" },
		);

		assertResponseErrored(response, "Days do not form one week");
	});
});

describe("events action: SAVE_SCHEDULE_VISIBILITY", () => {
	const visibilityOf = async (userId: number) =>
		(await UserRepository.findLeanById(userId))?.preferences
			?.scheduleVisibility;

	test("saves the picked friends and teams", async () => {
		const user = await UserFactory.createRegular();
		const shared = await TeamFactory.create({ memberUserIds: [user.id] });
		await TeamFactory.create({
			memberUserIds: [user.id],
			isMainTeam: false,
		});

		await saveScheduleVisibility(
			{
				_action: "SAVE_SCHEDULE_VISIBILITY",
				sharedWith: [SCHEDULE_VISIBILITY_FRIENDS_VALUE, String(shared.id)],
			},
			{ user: "regular" },
		);

		expect(await visibilityOf(user.id)).toEqual({
			friends: true,
			teamIds: [shared.id],
		});
	});

	test("stays on the default when everything is shared, so later teams are too", async () => {
		const user = await UserFactory.createRegular();
		const team = await TeamFactory.create({ memberUserIds: [user.id] });
		await saveScheduleVisibility(
			{ _action: "SAVE_SCHEDULE_VISIBILITY", sharedWith: [] },
			{ user: "regular" },
		);

		await saveScheduleVisibility(
			{
				_action: "SAVE_SCHEDULE_VISIBILITY",
				sharedWith: [SCHEDULE_VISIBILITY_FRIENDS_VALUE, String(team.id)],
			},
			{ user: "regular" },
		);

		expect(await visibilityOf(user.id)).toBeUndefined();
	});

	test("saves sharing with friends only for a user with no teams", async () => {
		const user = await UserFactory.createRegular();

		await saveScheduleVisibility(
			{
				_action: "SAVE_SCHEDULE_VISIBILITY",
				sharedWith: [SCHEDULE_VISIBILITY_FRIENDS_VALUE],
			},
			{ user: "regular" },
		);

		expect(await visibilityOf(user.id)).toEqual({
			friends: true,
			teamIds: [],
		});
	});

	test("saves sharing with nobody", async () => {
		const user = await UserFactory.createRegular();
		await TeamFactory.create({ memberUserIds: [user.id] });

		await saveScheduleVisibility(
			{ _action: "SAVE_SCHEDULE_VISIBILITY", sharedWith: [] },
			{ user: "regular" },
		);

		expect(await visibilityOf(user.id)).toEqual({
			friends: false,
			teamIds: [],
		});
	});

	test("drops a team the user is not a member of", async () => {
		const user = await UserFactory.createRegular();
		const other = await UserFactory.create();
		const otherTeam = await TeamFactory.create({ memberUserIds: [other.id] });

		await saveScheduleVisibility(
			{
				_action: "SAVE_SCHEDULE_VISIBILITY",
				sharedWith: [String(otherTeam.id)],
			},
			{ user: "regular" },
		);

		expect(await visibilityOf(user.id)).toEqual({
			friends: false,
			teamIds: [],
		});
	});
});

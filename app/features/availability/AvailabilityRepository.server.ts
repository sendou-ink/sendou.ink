import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import { databaseTimestampNow } from "~/utils/dates";
import { jsonArrayFrom } from "~/utils/kysely.server";
import type { TimeRange } from "./availability-types";

/** Longest a week can be, a DST week included. Weeks are indexed by their start, so finding the ones overlapping a window means looking this far back. */
const WEEK_MAX_SECONDS = 169 * 60 * 60;

/**
 * Reported availability of the given users for every week overlapping the given
 * window, with the week's slots and day notes. A week without slots was
 * submitted as "unavailable all week"; a user with no week at all for the
 * window simply has not reported anything.
 */
export function findAllWeeksByUserIds({
	userIds,
	startsAt,
	endsAt,
}: {
	userIds: Array<number>;
	startsAt: number;
	endsAt: number;
}) {
	if (userIds.length === 0) return Promise.resolve([]);

	return db
		.selectFrom("AvailabilityWeek")
		.select((eb) => [
			"AvailabilityWeek.id",
			"AvailabilityWeek.userId",
			"AvailabilityWeek.weekStartsAt",
			"AvailabilityWeek.timezone",
			"AvailabilityWeek.updatedAt",
			jsonArrayFrom(
				eb
					.selectFrom("AvailabilitySlot")
					.select(["AvailabilitySlot.startsAt", "AvailabilitySlot.endsAt"])
					.whereRef(
						"AvailabilitySlot.availabilityWeekId",
						"=",
						"AvailabilityWeek.id",
					)
					.orderBy("AvailabilitySlot.startsAt", "asc"),
			).as("slots"),
			jsonArrayFrom(
				eb
					.selectFrom("AvailabilityDayNote")
					.select(["AvailabilityDayNote.date", "AvailabilityDayNote.text"])
					.whereRef(
						"AvailabilityDayNote.availabilityWeekId",
						"=",
						"AvailabilityWeek.id",
					)
					.orderBy("AvailabilityDayNote.date", "asc"),
			).as("dayNotes"),
		])
		.where("AvailabilityWeek.userId", "in", userIds)
		.where("AvailabilityWeek.weekStartsAt", "<", endsAt)
		.where("AvailabilityWeek.weekStartsAt", ">", startsAt - WEEK_MAX_SECONDS)
		.execute();
}

/**
 * Team events of every team the given users are members of (secondary teams
 * included) that overlap the given window, one row per member.
 */
export function findAllTeamEventsByUserIds({
	userIds,
	startsAt,
	endsAt,
}: {
	userIds: Array<number>;
	startsAt: number;
	endsAt: number;
}) {
	if (userIds.length === 0) return Promise.resolve([]);

	return db
		.selectFrom("TeamEvent")
		.innerJoin(
			"TeamMemberWithSecondary",
			"TeamMemberWithSecondary.teamId",
			"TeamEvent.teamId",
		)
		.select([
			"TeamMemberWithSecondary.userId",
			"TeamEvent.name",
			"TeamEvent.startsAt",
			"TeamEvent.endsAt",
		])
		.where("TeamMemberWithSecondary.userId", "in", userIds)
		.where("TeamEvent.startsAt", "<", endsAt)
		.where("TeamEvent.endsAt", ">", startsAt)
		.execute();
}

interface UpsertOwnWeekArgs {
	weekStartsAt: number;
	timezone: string;
	slots: Array<TimeRange>;
	dayNotes: Array<
		Pick<TablesInsertable["AvailabilityDayNote"], "date" | "text">
	>;
}

/**
 * Saves the acting user's availability for one week, replacing whatever they
 * had reported for it. The week is saved as a whole, so slots and day notes
 * left out are removed.
 *
 * @returns id of the week
 */
export function upsertOwnWeek(args: UpsertOwnWeekArgs) {
	const userId = actorId();

	return db.transaction().execute(async (trx) => {
		const week = await trx
			.insertInto("AvailabilityWeek")
			.values({
				userId,
				weekStartsAt: args.weekStartsAt,
				timezone: args.timezone,
			})
			.onConflict((oc) =>
				oc.columns(["userId", "weekStartsAt"]).doUpdateSet({
					timezone: args.timezone,
					updatedAt: databaseTimestampNow(),
				}),
			)
			.returning("id")
			.executeTakeFirstOrThrow();

		await trx
			.deleteFrom("AvailabilitySlot")
			.where("AvailabilitySlot.availabilityWeekId", "=", week.id)
			.execute();
		await trx
			.deleteFrom("AvailabilityDayNote")
			.where("AvailabilityDayNote.availabilityWeekId", "=", week.id)
			.execute();

		if (args.slots.length > 0) {
			await trx
				.insertInto("AvailabilitySlot")
				.values(
					args.slots.map((slot) => ({
						availabilityWeekId: week.id,
						startsAt: slot.startsAt,
						endsAt: slot.endsAt,
					})),
				)
				.execute();
		}

		if (args.dayNotes.length > 0) {
			await trx
				.insertInto("AvailabilityDayNote")
				.values(
					args.dayNotes.map((dayNote) => ({
						availabilityWeekId: week.id,
						date: dayNote.date,
						text: dayNote.text,
					})),
				)
				.execute();
		}

		return week.id;
	});
}

/**
 * Deletes availability weeks that started before the given timestamp. Their
 * slots and day notes go with them via cascade delete.
 */
export function deleteWeeksStartedBefore(weekStartsAt: number) {
	return db
		.deleteFrom("AvailabilityWeek")
		.where("AvailabilityWeek.weekStartsAt", "<", weekStartsAt)
		.execute();
}

/**
 * Adds an event the whole team takes part in. Author is the acting user.
 *
 * @returns id of the new event
 */
export async function insertTeamEvent(
	args: Omit<TablesInsertable["TeamEvent"], "authorId">,
) {
	const event = await db
		.insertInto("TeamEvent")
		.values({ ...args, authorId: actorId() })
		.returning("id")
		.executeTakeFirstOrThrow();

	return event.id;
}

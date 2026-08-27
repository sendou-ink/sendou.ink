import * as R from "remeda";
import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import { databaseTimestampNow } from "~/utils/dates";
import {
	concatUserSubmittedImagePrefix,
	jsonArrayFrom,
} from "~/utils/kysely.server";
import { AVAILABILITY } from "./availability-constants";
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
 * Whether the user has reported the week starting at `weekStartsAt`. The week
 * is theirs to place, so a start within {@link AVAILABILITY.WEEK_MATCH_MAX_DISTANCE_SECONDS}
 * of the asked one is the same week seen from another timezone.
 */
export async function hasReportedWeek({
	userId,
	weekStartsAt,
}: {
	userId: number;
	weekStartsAt: number;
}) {
	const week = await db
		.selectFrom("AvailabilityWeek")
		.select("AvailabilityWeek.id")
		.where("AvailabilityWeek.userId", "=", userId)
		.where(
			"AvailabilityWeek.weekStartsAt",
			">",
			weekStartsAt - AVAILABILITY.WEEK_MATCH_MAX_DISTANCE_SECONDS,
		)
		.where(
			"AvailabilityWeek.weekStartsAt",
			"<",
			weekStartsAt + AVAILABILITY.WEEK_MATCH_MAX_DISTANCE_SECONDS,
		)
		.executeTakeFirst();

	return Boolean(week);
}

/**
 * Ids of the users who have not reported the week starting at `weekStartsAt`
 * while at least one of their teammates has — the reminder is only worth
 * sending when somebody else on the team already moved.
 */
export async function findWeekReminderUserIds(weekStartsAt: number) {
	const memberships = await db
		.selectFrom("TeamMemberWithSecondary")
		.leftJoin("AvailabilityWeek", (join) =>
			join
				.onRef("AvailabilityWeek.userId", "=", "TeamMemberWithSecondary.userId")
				.on(
					"AvailabilityWeek.weekStartsAt",
					">",
					weekStartsAt - AVAILABILITY.WEEK_MATCH_MAX_DISTANCE_SECONDS,
				)
				.on(
					"AvailabilityWeek.weekStartsAt",
					"<",
					weekStartsAt + AVAILABILITY.WEEK_MATCH_MAX_DISTANCE_SECONDS,
				),
		)
		.select([
			"TeamMemberWithSecondary.userId",
			"TeamMemberWithSecondary.teamId",
			"AvailabilityWeek.id as reportedWeekId",
		])
		.execute();

	const userIds = new Set<number>();
	for (const team of Object.values(
		R.groupBy(memberships, (membership) => membership.teamId),
	)) {
		if (!team.some((member) => member.reportedWeekId !== null)) continue;

		for (const member of team) {
			if (member.reportedWeekId === null) userIds.add(member.userId);
		}
	}

	return Array.from(userIds);
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

/** Team events of one team overlapping the given window. */
export function findTeamEventsByTeamId({
	teamId,
	startsAt,
	endsAt,
}: {
	teamId: number;
	startsAt: number;
	endsAt: number;
}) {
	return db
		.selectFrom("TeamEvent")
		.select([
			"TeamEvent.id",
			"TeamEvent.name",
			"TeamEvent.startsAt",
			"TeamEvent.endsAt",
		])
		.where("TeamEvent.teamId", "=", teamId)
		.where("TeamEvent.startsAt", "<", endsAt)
		.where("TeamEvent.endsAt", ">", startsAt)
		.orderBy("TeamEvent.startsAt", "asc")
		.execute();
}

/**
 * Ongoing and upcoming team events of every team the given user is a member of
 * (secondary teams included), starting within the given window, with the
 * owning team attached. For the user's personal calendar surfaces.
 */
export function findAllUpcomingTeamEventsByUserId({
	userId,
	startsAt,
	endsAt,
}: {
	userId: number;
	startsAt: number;
	endsAt: number;
}) {
	return db
		.selectFrom("TeamEvent")
		.innerJoin(
			"TeamMemberWithSecondary",
			"TeamMemberWithSecondary.teamId",
			"TeamEvent.teamId",
		)
		.innerJoin("Team", "Team.id", "TeamEvent.teamId")
		.leftJoin("UserSubmittedImage", "Team.avatarImgId", "UserSubmittedImage.id")
		.select((eb) => [
			"TeamEvent.id",
			"TeamEvent.name",
			"TeamEvent.startsAt",
			"TeamEvent.endsAt",
			"Team.name as teamName",
			"Team.customUrl as teamCustomUrl",
			concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
				"teamAvatarUrl",
			),
		])
		.where("TeamMemberWithSecondary.userId", "=", userId)
		.where("TeamEvent.endsAt", ">", startsAt)
		.where("TeamEvent.startsAt", "<", endsAt)
		.orderBy("TeamEvent.startsAt", "asc")
		.execute();
}

export function findTeamEventById(id: number) {
	return db
		.selectFrom("TeamEvent")
		.select(["TeamEvent.id", "TeamEvent.teamId"])
		.where("TeamEvent.id", "=", id)
		.executeTakeFirst();
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
		.executeTakeFirstOrThrow();
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

export function deleteTeamEvent(id: number) {
	return db.deleteFrom("TeamEvent").where("TeamEvent.id", "=", id).execute();
}

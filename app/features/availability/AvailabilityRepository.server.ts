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

/** Longest week (DST included). Weeks are indexed by start, so overlapping a window means looking this far back. */
const WEEK_MAX_SECONDS = 169 * 60 * 60;

/**
 * Reported weeks of the given users overlapping the window, with slots and day notes. A week
 * without slots means "unavailable all week"; no week at all means nothing was reported.
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
 * Whether the user reported the week starting at `weekStartsAt`. A start within
 * {@link AVAILABILITY.WEEK_MATCH_MAX_DISTANCE_SECONDS} is the same week seen from another timezone.
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
 * Users who have not reported the week starting at `weekStartsAt` while a teammate has (a reminder
 * is only worth sending then). Cheerleaders are left out, the schedule views do not show them.
 */
export async function findWeekReminderUserIds(weekStartsAt: number) {
	const memberships = await db
		.selectFrom("TeamMemberWithSecondary")
		.where((eb) =>
			eb.or([
				eb("TeamMemberWithSecondary.role", "is", null),
				eb("TeamMemberWithSecondary.role", "!=", "CHEERLEADER"),
			]),
		)
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
 * Team events overlapping the window of every team (secondary included) the users are members of,
 * one row per member. Events limited to selected participants only produce rows for those.
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
		.where((eb) => {
			const participants = eb
				.selectFrom("TeamEventMember")
				.select("TeamEventMember.userId")
				.whereRef("TeamEventMember.teamEventId", "=", "TeamEvent.id");

			return eb.or([
				eb.not(eb.exists(participants)),
				eb.exists(
					participants.whereRef(
						"TeamEventMember.userId",
						"=",
						"TeamMemberWithSecondary.userId",
					),
				),
			]);
		})
		.execute();
}

/** One team's events overlapping the window, with the participant user ids (empty = the whole team). */
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
		.select((eb) => [
			"TeamEvent.id",
			"TeamEvent.name",
			"TeamEvent.startsAt",
			"TeamEvent.endsAt",
			jsonArrayFrom(
				eb
					.selectFrom("TeamEventMember")
					.select("TeamEventMember.userId")
					.whereRef("TeamEventMember.teamEventId", "=", "TeamEvent.id")
					.orderBy("TeamEventMember.userId", "asc"),
			).as("participants"),
		])
		.where("TeamEvent.teamId", "=", teamId)
		.where("TeamEvent.startsAt", "<", endsAt)
		.where("TeamEvent.endsAt", ">", startsAt)
		.orderBy("TeamEvent.startsAt", "asc")
		.execute();
}

/**
 * Ongoing and upcoming events starting within the window of every team (secondary included) the
 * user is a member of, with the owning team. Events limited to selected participants show up only
 * for those. For the user's personal calendar views.
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
		.where((eb) => {
			const participants = eb
				.selectFrom("TeamEventMember")
				.select("TeamEventMember.userId")
				.whereRef("TeamEventMember.teamEventId", "=", "TeamEvent.id");

			return eb.or([
				eb.not(eb.exists(participants)),
				eb.exists(participants.where("TeamEventMember.userId", "=", userId)),
			]);
		})
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
 * Replaces the acting user's week as a whole (slots and day notes left out are removed). A week
 * reported earlier from another timezone (start hours apart, never days) is replaced, not duplicated.
 * Returns the week id.
 */
export function upsertOwnWeek(args: UpsertOwnWeekArgs) {
	const userId = actorId();

	return db.transaction().execute(async (trx) => {
		const existing = await trx
			.selectFrom("AvailabilityWeek")
			.select("AvailabilityWeek.id")
			.where("AvailabilityWeek.userId", "=", userId)
			.where(
				"AvailabilityWeek.weekStartsAt",
				">",
				args.weekStartsAt - AVAILABILITY.WEEK_MATCH_MAX_DISTANCE_SECONDS,
			)
			.where(
				"AvailabilityWeek.weekStartsAt",
				"<",
				args.weekStartsAt + AVAILABILITY.WEEK_MATCH_MAX_DISTANCE_SECONDS,
			)
			.executeTakeFirst();

		const week = existing
			? await trx
					.updateTable("AvailabilityWeek")
					.set({
						weekStartsAt: args.weekStartsAt,
						timezone: args.timezone,
						updatedAt: databaseTimestampNow(),
					})
					.where("AvailabilityWeek.id", "=", existing.id)
					.returning("id")
					.executeTakeFirstOrThrow()
			: await trx
					.insertInto("AvailabilityWeek")
					.values({
						userId,
						weekStartsAt: args.weekStartsAt,
						timezone: args.timezone,
					})
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

/** Deletes weeks started before the timestamp; slots and day notes cascade. */
export function deleteWeeksStartedBefore(weekStartsAt: number) {
	return db
		.deleteFrom("AvailabilityWeek")
		.where("AvailabilityWeek.weekStartsAt", "<", weekStartsAt)
		.executeTakeFirstOrThrow();
}

/** Deletes team events that ended before the given timestamp. */
export function deleteTeamEventsEndedBefore(endsAt: number) {
	return db
		.deleteFrom("TeamEvent")
		.where("TeamEvent.endsAt", "<", endsAt)
		.executeTakeFirstOrThrow();
}

/** Adds a team event authored by the acting user; without `participantUserIds` the whole team takes part. Returns its id. */
export function insertTeamEvent({
	participantUserIds,
	...args
}: Omit<TablesInsertable["TeamEvent"], "authorId"> & {
	participantUserIds?: Array<number>;
}) {
	const authorId = actorId();

	return db.transaction().execute(async (trx) => {
		const event = await trx
			.insertInto("TeamEvent")
			.values({ ...args, authorId })
			.returning("id")
			.executeTakeFirstOrThrow();

		if (participantUserIds && participantUserIds.length > 0) {
			await trx
				.insertInto("TeamEventMember")
				.values(
					participantUserIds.map((userId) => ({
						teamEventId: event.id,
						userId,
					})),
				)
				.execute();
		}

		return event.id;
	});
}

/** Updates a team event, replacing its participant limitation (none = the whole team takes part). */
export function updateTeamEvent({
	id,
	participantUserIds,
	...args
}: {
	id: number;
	name: string;
	startsAt: number;
	endsAt: number;
	participantUserIds?: Array<number>;
}) {
	return db.transaction().execute(async (trx) => {
		await trx
			.updateTable("TeamEvent")
			.set(args)
			.where("TeamEvent.id", "=", id)
			.execute();

		await trx
			.deleteFrom("TeamEventMember")
			.where("TeamEventMember.teamEventId", "=", id)
			.execute();

		if (participantUserIds && participantUserIds.length > 0) {
			await trx
				.insertInto("TeamEventMember")
				.values(
					participantUserIds.map((userId) => ({ teamEventId: id, userId })),
				)
				.execute();
		}
	});
}

export function deleteTeamEvent(id: number) {
	return db.deleteFrom("TeamEvent").where("TeamEvent.id", "=", id).execute();
}

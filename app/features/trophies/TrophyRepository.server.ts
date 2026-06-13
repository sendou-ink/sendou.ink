import { sub } from "date-fns";
import type { ExpressionBuilder } from "kysely";
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";
import * as R from "remeda";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import {
	COMMON_USER_FIELDS,
	tournamentLogoWithDefault,
} from "~/utils/kysely.server";
import { getTentativeTier } from "../tournament-organization/core/tentativeTiers.server";
import { sortTrophiesByFavorites } from "../user-page/core/trophy-sorting.server";
import { TROPHY_APPROVALS_REQUIRED } from "./trophies-constants";

type TrophyRecentTournament = {
	tier: number | null;
	name: string;
	organizationId: number | null;
	startTime: number | null;
};

export async function all() {
	const rows = await db
		.selectFrom("Trophy")
		.select((eb) => ["id", "name", "model", withRecentTournament(eb)])
		.execute();

	return sortByEffectiveTier(rows.map(addEffectiveTier));
}

const withRecentTournament = (eb: ExpressionBuilder<DB, "Trophy">) =>
	jsonObjectFrom(
		eb
			.selectFrom("CalendarEvent")
			.innerJoin("Tournament", "Tournament.id", "CalendarEvent.tournamentId")
			.select((eb2) => [
				"Tournament.tier",
				"CalendarEvent.name",
				"CalendarEvent.organizationId",
				eb2
					.selectFrom("CalendarEventDate")
					.select((eb3) => eb3.fn.min<number>("startTime").as("startTime"))
					.whereRef("CalendarEventDate.eventId", "=", "CalendarEvent.id")
					.as("startTime"),
			])
			.whereRef("CalendarEvent.trophyId", "=", "Trophy.id")
			.orderBy(
				(eb2) =>
					eb2
						.selectFrom("CalendarEventDate")
						.select((eb3) => eb3.fn.min<number>("startTime").as("startTime"))
						.whereRef("CalendarEventDate.eventId", "=", "CalendarEvent.id"),
				"desc",
			)
			.limit(1),
	).as("recentTournament");

function addEffectiveTier<
	T extends { recentTournament: TrophyRecentTournament | null },
>({ recentTournament, ...rest }: T) {
	if (!recentTournament) {
		return { ...rest, tier: null, tentativeTier: null };
	}

	const isPastEvent =
		recentTournament.startTime !== null &&
		databaseTimestampToDate(recentTournament.startTime) <
			sub(new Date(), { days: 1 });

	const tentativeTier =
		recentTournament.tier === null &&
		recentTournament.organizationId !== null &&
		!isPastEvent
			? getTentativeTier(recentTournament.organizationId, recentTournament.name)
			: null;

	return { ...rest, tier: recentTournament.tier, tentativeTier };
}

function sortByEffectiveTier<
	T extends { id: number; tier: number | null; tentativeTier: number | null },
>(rows: T[]) {
	return R.sortBy(
		rows,
		(row) => row.tier ?? row.tentativeTier ?? Number.MAX_SAFE_INTEGER,
		(row) => row.id,
	);
}

const withCreator = (eb: ExpressionBuilder<DB, "Trophy">) => {
	return jsonObjectFrom(
		eb
			.selectFrom("User")
			.select(COMMON_USER_FIELDS)
			.whereRef("User.id", "=", "Trophy.creatorId"),
	).as("creator");
};

const withManager = (eb: ExpressionBuilder<DB, "Trophy">) => {
	return jsonObjectFrom(
		eb
			.selectFrom("User")
			.select(COMMON_USER_FIELDS)
			.whereRef("User.id", "=", "Trophy.managerId"),
	).as("manager");
};

const withOrganization = (eb: ExpressionBuilder<DB, "Trophy">) => {
	return jsonObjectFrom(
		eb
			.selectFrom("TournamentOrganization")
			.select(["TournamentOrganization.name", "TournamentOrganization.slug"])
			.whereRef("TournamentOrganization.id", "=", "Trophy.organizationId"),
	).as("organization");
};

const withOwners = (eb: ExpressionBuilder<DB, "Trophy">) => {
	return jsonArrayFrom(
		eb
			.selectFrom("TrophyOwner")
			.innerJoin("User", "TrophyOwner.userId", "User.id")
			.select(({ fn }) => [
				fn.count<number>("TrophyOwner.trophyId").as("count"),
				...COMMON_USER_FIELDS,
			])
			.whereRef("TrophyOwner.trophyId", "=", "Trophy.id")
			.groupBy("User.id")
			.orderBy("count", "desc"),
	).as("owners");
};

export async function findByOrganizationId(organizationId: number) {
	const rows = await db
		.selectFrom("Trophy")
		.select((eb) => ["id", "name", "model", withRecentTournament(eb)])
		.where("organizationId", "=", organizationId)
		.execute();

	return sortByEffectiveTier(rows.map(addEffectiveTier));
}

export async function findByOrganizationIds(organizationIds: number[]) {
	if (organizationIds.length === 0) return [];

	return db
		.selectFrom("Trophy")
		.select(["id", "name", "model", "organizationId"])
		.where("organizationId", "in", organizationIds)
		.execute();
}

async function findOwnedTrophies(userId: number) {
	const rows = await db
		.selectFrom("TrophyOwner")
		.innerJoin("Trophy", "Trophy.id", "TrophyOwner.trophyId")
		.innerJoin("User", "User.id", "TrophyOwner.userId")
		.select(({ fn }) => [
			fn.count<number>("TrophyOwner.trophyId").as("count"),
			fn.min<number | null>("TrophyOwner.tier").as("tier"),
			"Trophy.id",
			"Trophy.name",
			"Trophy.model",
			"User.favoriteTrophyIds",
			"User.hiddenTrophyIds",
			"User.patronTier",
		])
		.where("TrophyOwner.userId", "=", userId)
		.groupBy(["TrophyOwner.trophyId", "TrophyOwner.userId"])
		.execute();

	return rows;
}

export async function findByOwnerUserId(userId: number) {
	const rows = await findOwnedTrophies(userId);

	if (rows.length === 0) return [];

	const { favoriteTrophyIds, hiddenTrophyIds, patronTier } = rows[0];
	const hiddenSet = new Set(hiddenTrophyIds ?? []);

	return sortTrophiesByFavorites({
		favoriteTrophyIds,
		hiddenTrophyIds,
		patronTier,
		trophies: rows
			.filter((row) => !hiddenSet.has(row.id))
			.map(
				({
					favoriteTrophyIds: _,
					hiddenTrophyIds: __,
					patronTier: ___,
					...trophy
				}) => trophy,
			),
	}).trophies;
}

export async function findByOwnerUserIdIncludingHidden(userId: number) {
	const rows = await findOwnedTrophies(userId);

	return rows.map(
		({
			favoriteTrophyIds: _,
			hiddenTrophyIds: __,
			patronTier: ___,
			...trophy
		}) => trophy,
	);
}

export async function findById(trophyId: number) {
	const row = await db
		.selectFrom("Trophy")
		.select((eb) => [
			"Trophy.id",
			"Trophy.name",
			"Trophy.model",
			withCreator(eb),
			withManager(eb),
			withOrganization(eb),
			withOwners(eb),
		])
		.where("Trophy.id", "=", trophyId)
		.executeTakeFirst();

	return row ?? null;
}

export async function findTournamentsByTrophyId(trophyId: number) {
	const rows = await db
		.selectFrom("CalendarEvent")
		.innerJoin("Tournament", "Tournament.id", "CalendarEvent.tournamentId")
		.select((eb) => [
			"Tournament.id as tournamentId",
			"CalendarEvent.name",
			"CalendarEvent.organizationId",
			"Tournament.tier",
			tournamentLogoWithDefault(eb).as("logoUrl"),
			eb
				.selectFrom("CalendarEventDate")
				.select((eb2) => eb2.fn.min<number>("startTime").as("startTime"))
				.whereRef("CalendarEventDate.eventId", "=", "CalendarEvent.id")
				.as("startTime"),
			eb
				.selectFrom("TournamentTeam")
				.select((eb2) => eb2.fn.countAll<number>().as("count"))
				.whereRef("TournamentTeam.tournamentId", "=", "Tournament.id")
				.where("TournamentTeam.isPlaceholder", "=", 0)
				.as("teamsCount"),
		])
		.where("CalendarEvent.trophyId", "=", trophyId)
		.where("CalendarEvent.hidden", "=", 0)
		.orderBy("startTime", "desc")
		.execute();

	return rows.map((row) => {
		const isPastEvent =
			row.startTime !== null &&
			databaseTimestampToDate(row.startTime) < sub(new Date(), { days: 1 });
		const tentativeTier =
			row.tier === null && row.organizationId !== null && !isPastEvent
				? getTentativeTier(row.organizationId, row.name)
				: null;

		return {
			tournamentId: row.tournamentId,
			name: row.name,
			tier: row.tier,
			tentativeTier,
			logoUrl: row.logoUrl,
			startTime: row.startTime,
			teamsCount: row.teamsCount,
		};
	});
}

export async function findOrganizationIdById(trophyId: number) {
	const row = await db
		.selectFrom("Trophy")
		.select("organizationId")
		.where("id", "=", trophyId)
		.executeTakeFirst();

	return row?.organizationId ?? null;
}

export async function existsByName(args: {
	name: string;
	excludeTrophyId?: number;
}) {
	let trophyQuery = db
		.selectFrom("Trophy")
		.select("id")
		.where("name", "=", args.name);

	if (args.excludeTrophyId !== undefined) {
		trophyQuery = trophyQuery.where("id", "!=", args.excludeTrophyId);
	}

	const trophy = await trophyQuery.executeTakeFirst();

	if (trophy) return true;

	let pendingQuery = db
		.selectFrom("PendingTrophy")
		.select("id")
		.where("name", "=", args.name)
		.where("declinedAt", "is", null);

	if (args.excludeTrophyId !== undefined) {
		pendingQuery = pendingQuery.where(
			"targetTrophyId",
			"is not",
			args.excludeTrophyId,
		);
	}

	const pending = await pendingQuery.executeTakeFirst();

	return Boolean(pending);
}

export async function findManagedBy(userId: number) {
	return db
		.selectFrom("Trophy")
		.select(["id", "name", "model", "organizationId", "managerId"])
		.where("managerId", "=", userId)
		.execute();
}

export async function findAllForEditing() {
	return db
		.selectFrom("Trophy")
		.select(["id", "name", "model", "organizationId", "managerId"])
		.execute();
}

export async function createPending(args: {
	name: string;
	model: string;
	description: string;
	organizationId: number;
	submitterUserId: number;
	targetTrophyId?: number;
	managerId?: number;
}) {
	return db
		.insertInto("PendingTrophy")
		.values({
			name: args.name,
			model: args.model,
			description: args.description,
			organizationId: args.organizationId,
			submitterUserId: args.submitterUserId,
			createdAt: dateToDatabaseTimestamp(new Date()),
			declineReason: null,
			declinedAt: null,
			declinedByUserId: null,
			targetTrophyId: args.targetTrophyId ?? null,
			managerId: args.managerId ?? null,
		})
		.returning("id")
		.executeTakeFirstOrThrow();
}

const withApprovals = (eb: ExpressionBuilder<DB, "PendingTrophy">) => {
	return jsonArrayFrom(
		eb
			.selectFrom("PendingTrophyApproval")
			.innerJoin("User", "PendingTrophyApproval.userId", "User.id")
			.select([
				"PendingTrophyApproval.userId",
				"PendingTrophyApproval.createdAt",
				"User.username",
			])
			.whereRef(
				"PendingTrophyApproval.pendingTrophyId",
				"=",
				"PendingTrophy.id",
			)
			.orderBy("PendingTrophyApproval.createdAt", "asc"),
	).as("approvals");
};

const withTarget = (eb: ExpressionBuilder<DB, "PendingTrophy">) => {
	return jsonObjectFrom(
		eb
			.selectFrom("Trophy")
			.leftJoin("User", "User.id", "Trophy.managerId")
			.leftJoin(
				"TournamentOrganization",
				"TournamentOrganization.id",
				"Trophy.organizationId",
			)
			.select([
				"Trophy.id",
				"Trophy.name",
				"Trophy.model",
				"Trophy.organizationId",
				"Trophy.managerId",
				"User.username as managerUsername",
				"TournamentOrganization.name as organizationName",
				"TournamentOrganization.slug as organizationSlug",
			])
			.whereRef("Trophy.id", "=", "PendingTrophy.targetTrophyId"),
	).as("target");
};

const withTargetManager = (eb: ExpressionBuilder<DB, "PendingTrophy">) => {
	return jsonObjectFrom(
		eb
			.selectFrom("User")
			.select(["User.id", "User.username", "User.discordId"])
			.whereRef("User.id", "=", "PendingTrophy.managerId"),
	).as("manager");
};

function pendingBaseQuery() {
	return db
		.selectFrom("PendingTrophy")
		.leftJoin(
			"User as Submitter",
			"Submitter.id",
			"PendingTrophy.submitterUserId",
		)
		.leftJoin(
			"User as Decliner",
			"Decliner.id",
			"PendingTrophy.declinedByUserId",
		)
		.leftJoin(
			"TournamentOrganization",
			"TournamentOrganization.id",
			"PendingTrophy.organizationId",
		)
		.select((eb) => [
			"PendingTrophy.id",
			"PendingTrophy.name",
			"PendingTrophy.model",
			"PendingTrophy.description",
			"PendingTrophy.organizationId",
			"PendingTrophy.submitterUserId",
			"PendingTrophy.createdAt",
			"PendingTrophy.declineReason",
			"PendingTrophy.declinedAt",
			"PendingTrophy.declinedByUserId",
			"PendingTrophy.targetTrophyId",
			"PendingTrophy.managerId",
			"Submitter.username as submitterUsername",
			"Submitter.discordId as submitterDiscordId",
			"Decliner.username as declinedByUsername",
			"TournamentOrganization.name as organizationName",
			"TournamentOrganization.slug as organizationSlug",
			withApprovals(eb),
			withTarget(eb),
			withTargetManager(eb),
		]);
}

export async function findPendingById(id: number) {
	const row = await pendingBaseQuery()
		.where("PendingTrophy.id", "=", id)
		.executeTakeFirst();

	return row ?? null;
}

export async function allPending() {
	return pendingBaseQuery()
		.orderBy("PendingTrophy.createdAt", "desc")
		.execute();
}

export async function pendingBySubmitter(submitterUserId: number) {
	return pendingBaseQuery()
		.where("PendingTrophy.submitterUserId", "=", submitterUserId)
		.orderBy("PendingTrophy.createdAt", "desc")
		.execute();
}

export async function unreviewedCountBySubmitter(submitterUserId: number) {
	const row = await db
		.selectFrom("PendingTrophy")
		.select((eb) => eb.fn.countAll<number>().as("count"))
		.where("submitterUserId", "=", submitterUserId)
		.where("declinedAt", "is", null)
		.where((eb) =>
			eb(
				eb
					.selectFrom("PendingTrophyApproval")
					.select((eb2) => eb2.fn.countAll<number>().as("approvalCount"))
					.whereRef(
						"PendingTrophyApproval.pendingTrophyId",
						"=",
						"PendingTrophy.id",
					),
				"<",
				TROPHY_APPROVALS_REQUIRED,
			),
		)
		.executeTakeFirstOrThrow();

	return row.count;
}

export async function deletePending(id: number) {
	await db.deleteFrom("PendingTrophy").where("id", "=", id).execute();
}

export async function declinePending(args: {
	id: number;
	reason: string;
	declinedByUserId: number;
}) {
	return db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("PendingTrophyApproval")
			.where("pendingTrophyId", "=", args.id)
			.execute();

		await trx
			.updateTable("PendingTrophy")
			.set({
				declineReason: args.reason,
				declinedAt: dateToDatabaseTimestamp(new Date()),
				declinedByUserId: args.declinedByUserId,
			})
			.where("id", "=", args.id)
			.execute();
	});
}

export async function addApproval(args: {
	pendingTrophyId: number;
	userId: number;
}) {
	return db.transaction().execute(async (trx) => {
		await trx
			.insertInto("PendingTrophyApproval")
			.values({
				pendingTrophyId: args.pendingTrophyId,
				userId: args.userId,
				createdAt: dateToDatabaseTimestamp(new Date()),
			})
			.execute();

		const { count } = await trx
			.selectFrom("PendingTrophyApproval")
			.select((eb) => eb.fn.countAll<number>().as("count"))
			.where("pendingTrophyId", "=", args.pendingTrophyId)
			.executeTakeFirstOrThrow();

		if (count < TROPHY_APPROVALS_REQUIRED) {
			return null;
		}

		const pending = await trx
			.selectFrom("PendingTrophy")
			.select([
				"id",
				"name",
				"model",
				"organizationId",
				"submitterUserId",
				"targetTrophyId",
				"managerId",
			])
			.where("id", "=", args.pendingTrophyId)
			.where("declinedAt", "is", null)
			.executeTakeFirst();

		if (!pending) return null;

		if (pending.targetTrophyId !== null) {
			await trx
				.updateTable("Trophy")
				.set({
					name: pending.name,
					model: pending.model,
					organizationId: pending.organizationId,
					managerId: pending.managerId ?? pending.submitterUserId,
				})
				.where("id", "=", pending.targetTrophyId)
				.execute();
			return { id: pending.targetTrophyId };
		}

		return trx
			.insertInto("Trophy")
			.values({
				name: pending.name,
				model: pending.model,
				organizationId: pending.organizationId,
				creatorId: pending.submitterUserId,
				managerId: pending.managerId ?? pending.submitterUserId,
			})
			.returning("id")
			.executeTakeFirstOrThrow();
	});
}

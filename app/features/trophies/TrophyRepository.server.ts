import type { ExpressionBuilder } from "kysely";
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { COMMON_USER_FIELDS } from "~/utils/kysely.server";

export async function all() {
	return db.selectFrom("Trophy").select(["id", "name", "model"]).execute();
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

export async function existsByName(name: string) {
	const trophy = await db
		.selectFrom("Trophy")
		.select("id")
		.where("name", "=", name)
		.executeTakeFirst();

	if (trophy) return true;

	const pending = await db
		.selectFrom("PendingTrophy")
		.select("id")
		.where("name", "=", name)
		.where("declinedAt", "is", null)
		.executeTakeFirst();

	return Boolean(pending);
}

export async function createPending(args: {
	name: string;
	model: string;
	description: string;
	organizationId: number;
	submitterUserId: number;
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
			acceptedAt: null,
			acceptedByUserId: null,
		})
		.returning("id")
		.executeTakeFirstOrThrow();
}

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
			"User as Acceptor",
			"Acceptor.id",
			"PendingTrophy.acceptedByUserId",
		)
		.leftJoin(
			"TournamentOrganization",
			"TournamentOrganization.id",
			"PendingTrophy.organizationId",
		)
		.select([
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
			"PendingTrophy.acceptedAt",
			"PendingTrophy.acceptedByUserId",
			"Submitter.username as submitterUsername",
			"Submitter.discordId as submitterDiscordId",
			"Decliner.username as declinedByUsername",
			"Acceptor.username as acceptedByUsername",
			"TournamentOrganization.name as organizationName",
			"TournamentOrganization.slug as organizationSlug",
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
		.where("acceptedAt", "is", null)
		.where("declinedAt", "is", null)
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
	await db
		.updateTable("PendingTrophy")
		.set({
			declineReason: args.reason,
			declinedAt: dateToDatabaseTimestamp(new Date()),
			declinedByUserId: args.declinedByUserId,
		})
		.where("id", "=", args.id)
		.execute();
}

export async function acceptPending(args: {
	id: number;
	acceptedByUserId: number;
}) {
	return db.transaction().execute(async (trx) => {
		const pending = await trx
			.selectFrom("PendingTrophy")
			.select(["id", "name", "model", "organizationId", "submitterUserId"])
			.where("id", "=", args.id)
			.where("declinedAt", "is", null)
			.where("acceptedAt", "is", null)
			.executeTakeFirst();

		if (!pending) return null;

		const inserted = await trx
			.insertInto("Trophy")
			.values({
				name: pending.name,
				model: pending.model,
				organizationId: pending.organizationId,
				creatorId: pending.submitterUserId,
				managerId: pending.submitterUserId,
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		await trx
			.updateTable("PendingTrophy")
			.set({
				acceptedAt: dateToDatabaseTimestamp(new Date()),
				acceptedByUserId: args.acceptedByUserId,
			})
			.where("id", "=", args.id)
			.execute();

		return inserted;
	});
}

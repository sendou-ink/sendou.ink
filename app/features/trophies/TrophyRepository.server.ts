import { db } from "~/db/sql";
import { dateToDatabaseTimestamp } from "~/utils/dates";

export async function all() {
	return db.selectFrom("Trophy").select(["id", "name", "model"]).execute();
}

export async function findById(trophyId: number) {
	const row = await db
		.selectFrom("Trophy")
		.select(["id", "name", "model"])
		.where("id", "=", trophyId)
		.executeTakeFirst();

	return row ?? null;
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

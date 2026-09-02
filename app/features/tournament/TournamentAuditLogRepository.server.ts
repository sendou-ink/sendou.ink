import { sub } from "date-fns";
import type { Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import type { TournamentAuditLogMetadata } from "~/db/tables-json";
import { actorId } from "~/features/auth/core/user.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { commonUserSelect, jsonObjectFrom } from "~/utils/kysely.server";

export const AUDIT_LOG_PAGE_SIZE = 30;

type TournamentAuditLogType = Tables["TournamentAuditLog"]["type"];

interface InsertArgs {
	type: TournamentAuditLogType;
	/** The team the event concerns. Its identity is preserved in `TournamentTeamHistory`. */
	tournamentTeamId: number;
	/** The affected member, for member-level events. */
	subjectUserId?: number | null;
	metadata?: TournamentAuditLogMetadata | null;
}

/**
 * Inserts an audit log event in the caller's transaction, actor from `actorId()`. Ensures a
 * `TournamentTeamHistory` row exists so the event stays readable after the team is hard-deleted.
 */
export async function insert(args: InsertArgs, trx: Transaction<DB>) {
	const team = await trx
		.selectFrom("TournamentTeam")
		.select([
			"TournamentTeam.tournamentId",
			"TournamentTeam.name",
			"TournamentTeam.tournamentTeamHistoryId",
		])
		.where("TournamentTeam.id", "=", args.tournamentTeamId)
		.executeTakeFirstOrThrow();

	const tournamentTeamHistoryId =
		team.tournamentTeamHistoryId ??
		(await insertTeamHistory(
			{
				tournamentTeamId: args.tournamentTeamId,
				tournamentId: team.tournamentId,
				name: team.name,
			},
			trx,
		));

	await trx
		.insertInto("TournamentAuditLog")
		.values({
			tournamentId: team.tournamentId,
			type: args.type,
			actorUserId: actorId(),
			subjectUserId: args.subjectUserId ?? null,
			tournamentTeamHistoryId,
			metadata: args.metadata ? JSON.stringify(args.metadata) : null,
		})
		.execute();
}

/**
 * Fresh history row linked from the team, so a `TournamentTeam.id` SQLite reuses after a
 * hard-deletion never inherits the deleted team's identity. Returns the history id.
 */
async function insertTeamHistory(
	{
		tournamentTeamId,
		tournamentId,
		name,
	}: { tournamentTeamId: number; tournamentId: number; name: string },
	trx: Transaction<DB>,
) {
	const { id } = await trx
		.insertInto("TournamentTeamHistory")
		.values({ tournamentTeamId, tournamentId, name })
		.returning("id")
		.executeTakeFirstOrThrow();

	await trx
		.updateTable("TournamentTeam")
		.set({ tournamentTeamHistoryId: id })
		.where("TournamentTeam.id", "=", tournamentTeamId)
		.execute();

	return id;
}

/** Keeps the preserved name current after a rename. No-op without a history row (created on the first audited event). */
export function updateTeamHistoryName(
	trx: Transaction<DB>,
	{ tournamentTeamId, name }: { tournamentTeamId: number; name: string },
) {
	return trx
		.updateTable("TournamentTeamHistory")
		.set({ name })
		.where("TournamentTeamHistory.id", "=", (eb) =>
			eb
				.selectFrom("TournamentTeam")
				.select("TournamentTeam.tournamentTeamHistoryId")
				.where("TournamentTeam.id", "=", tournamentTeamId),
		)
		.execute();
}

/** A page of events, newest first, optionally filtered by type and/or team, with actor, affected member and (preserved) team name. */
export function findByTournamentId({
	tournamentId,
	type,
	tournamentTeamHistoryId,
	limit,
	offset,
}: {
	tournamentId: number;
	type?: TournamentAuditLogType;
	tournamentTeamHistoryId?: number;
	limit: number;
	offset: number;
}) {
	let query = db
		.selectFrom("TournamentAuditLog")
		.select((eb) => [
			"TournamentAuditLog.id",
			"TournamentAuditLog.type",
			"TournamentAuditLog.createdAt",
			"TournamentAuditLog.metadata",
			jsonObjectFrom(
				eb
					.selectFrom("User")
					.select((eb) => commonUserSelect(eb))
					.whereRef("User.id", "=", "TournamentAuditLog.actorUserId"),
			).as("actor"),
			jsonObjectFrom(
				eb
					.selectFrom("User")
					.select((eb) => commonUserSelect(eb))
					.whereRef("User.id", "=", "TournamentAuditLog.subjectUserId"),
			).as("subject"),
			jsonObjectFrom(
				eb
					.selectFrom("TournamentTeamHistory")
					.select([
						"TournamentTeamHistory.id",
						"TournamentTeamHistory.tournamentTeamId",
						"TournamentTeamHistory.name",
					])
					.whereRef(
						"TournamentTeamHistory.id",
						"=",
						"TournamentAuditLog.tournamentTeamHistoryId",
					),
			).as("team"),
		])
		.where("TournamentAuditLog.tournamentId", "=", tournamentId)
		.orderBy("TournamentAuditLog.createdAt", "desc")
		.orderBy("TournamentAuditLog.id", "desc")
		.limit(limit)
		.offset(offset);

	if (type) {
		query = query.where("TournamentAuditLog.type", "=", type);
	}
	if (typeof tournamentTeamHistoryId === "number") {
		query = query.where(
			"TournamentAuditLog.tournamentTeamHistoryId",
			"=",
			tournamentTeamHistoryId,
		);
	}

	return query.execute();
}

/** Event count under the same filters as {@link findByTournamentId}, for pagination. */
export async function countByTournamentId({
	tournamentId,
	type,
	tournamentTeamHistoryId,
}: {
	tournamentId: number;
	type?: TournamentAuditLogType;
	tournamentTeamHistoryId?: number;
}) {
	let query = db
		.selectFrom("TournamentAuditLog")
		.select((eb) => eb.fn.countAll<number>().as("count"))
		.where("TournamentAuditLog.tournamentId", "=", tournamentId);

	if (type) {
		query = query.where("TournamentAuditLog.type", "=", type);
	}
	if (typeof tournamentTeamHistoryId === "number") {
		query = query.where(
			"TournamentAuditLog.tournamentTeamHistoryId",
			"=",
			tournamentTeamHistoryId,
		);
	}

	const result = await query.executeTakeFirstOrThrow();

	return result.count;
}

/** Deletes audit log events older than three months. */
export function deleteOld() {
	return db
		.deleteFrom("TournamentAuditLog")
		.where(
			"createdAt",
			"<",
			dateToDatabaseTimestamp(sub(new Date(), { months: 3 })),
		)
		.executeTakeFirst();
}

/** Every team (deleted ones included) in the tournament's audit log, for the team filter. */
export function findTeamsByTournamentId(tournamentId: number) {
	return db
		.selectFrom("TournamentTeamHistory")
		.select([
			"TournamentTeamHistory.id",
			"TournamentTeamHistory.tournamentTeamId",
			"TournamentTeamHistory.name",
		])
		.where("TournamentTeamHistory.tournamentId", "=", tournamentId)
		.orderBy("TournamentTeamHistory.name", "asc")
		.execute();
}

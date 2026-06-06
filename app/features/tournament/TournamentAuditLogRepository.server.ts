import type { Transaction } from "kysely";
import { jsonObjectFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import type { DB, Tables, TournamentAuditLogMetadata } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import { databaseTimestampNow } from "~/utils/dates";
import { COMMON_USER_FIELDS } from "~/utils/kysely.server";

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
 * Inserts an audit log event within the caller's transaction (so it commits or
 * rolls back atomically with the mutation it records). The acting user is resolved
 * from request context via `actorId()`. Ensures a stable `TournamentTeamHistory`
 * row exists for the team, so the event remains readable even after the team is
 * hard-deleted.
 */
export async function insert(trx: Transaction<DB>, args: InsertArgs) {
	await trx
		.insertInto("TournamentTeamHistory")
		.columns(["tournamentTeamId", "tournamentId", "name"])
		.expression((eb) =>
			eb
				.selectFrom("TournamentTeam")
				.select([
					"TournamentTeam.id",
					"TournamentTeam.tournamentId",
					"TournamentTeam.name",
				])
				.where("TournamentTeam.id", "=", args.tournamentTeamId),
		)
		.onConflict((oc) => oc.column("tournamentTeamId").doNothing())
		.execute();

	const { tournamentId } = await trx
		.selectFrom("TournamentTeamHistory")
		.select("TournamentTeamHistory.tournamentId")
		.where("TournamentTeamHistory.tournamentTeamId", "=", args.tournamentTeamId)
		.executeTakeFirstOrThrow();

	await trx
		.insertInto("TournamentAuditLog")
		.values({
			tournamentId,
			type: args.type,
			actorUserId: actorId(),
			subjectUserId: args.subjectUserId ?? null,
			tournamentTeamId: args.tournamentTeamId,
			metadata: args.metadata ? JSON.stringify(args.metadata) : null,
			createdAt: databaseTimestampNow(),
		})
		.execute();
}

/**
 * Keeps the team's preserved name current after a rename. No-op when the team
 * has no history row yet (it will be created with the up-to-date name on its
 * first audited event).
 */
export function updateTeamHistoryName(
	trx: Transaction<DB>,
	{ tournamentTeamId, name }: { tournamentTeamId: number; name: string },
) {
	return trx
		.updateTable("TournamentTeamHistory")
		.set({ name })
		.where("TournamentTeamHistory.tournamentTeamId", "=", tournamentTeamId)
		.execute();
}

/**
 * Returns a page of audit log events for a tournament, newest first, optionally
 * filtered by event type and/or team. Resolves the actor, the affected member
 * (when present) and the team name (preserved even for deleted teams).
 */
export function findByTournamentId({
	tournamentId,
	type,
	tournamentTeamId,
	limit,
	offset,
}: {
	tournamentId: number;
	type?: TournamentAuditLogType;
	tournamentTeamId?: number;
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
					.select(COMMON_USER_FIELDS)
					.whereRef("User.id", "=", "TournamentAuditLog.actorUserId"),
			).as("actor"),
			jsonObjectFrom(
				eb
					.selectFrom("User")
					.select(COMMON_USER_FIELDS)
					.whereRef("User.id", "=", "TournamentAuditLog.subjectUserId"),
			).as("subject"),
			jsonObjectFrom(
				eb
					.selectFrom("TournamentTeamHistory")
					.select([
						"TournamentTeamHistory.tournamentTeamId as id",
						"TournamentTeamHistory.name",
					])
					.whereRef(
						"TournamentTeamHistory.tournamentTeamId",
						"=",
						"TournamentAuditLog.tournamentTeamId",
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
	if (typeof tournamentTeamId === "number") {
		query = query.where(
			"TournamentAuditLog.tournamentTeamId",
			"=",
			tournamentTeamId,
		);
	}

	return query.execute();
}

/** Counts audit log events for a tournament matching the same optional filters as {@link findByTournamentId}. Used for pagination. */
export async function countByTournamentId({
	tournamentId,
	type,
	tournamentTeamId,
}: {
	tournamentId: number;
	type?: TournamentAuditLogType;
	tournamentTeamId?: number;
}) {
	let query = db
		.selectFrom("TournamentAuditLog")
		.select((eb) => eb.fn.countAll<number>().as("count"))
		.where("TournamentAuditLog.tournamentId", "=", tournamentId);

	if (type) {
		query = query.where("TournamentAuditLog.type", "=", type);
	}
	if (typeof tournamentTeamId === "number") {
		query = query.where(
			"TournamentAuditLog.tournamentTeamId",
			"=",
			tournamentTeamId,
		);
	}

	const result = await query.executeTakeFirstOrThrow();

	return result.count;
}

/** Returns every team (including deleted ones) that has appeared in the tournament's audit log, for the team filter dropdown. */
export function findTeamsByTournamentId(tournamentId: number) {
	return db
		.selectFrom("TournamentTeamHistory")
		.select([
			"TournamentTeamHistory.tournamentTeamId as id",
			"TournamentTeamHistory.name",
		])
		.where("TournamentTeamHistory.tournamentId", "=", tournamentId)
		.orderBy("TournamentTeamHistory.name", "asc")
		.execute();
}

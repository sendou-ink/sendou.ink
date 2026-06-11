import { sub } from "date-fns";
import type { Transaction } from "kysely";
import { jsonObjectFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import type { DB, Tables, TournamentAuditLogMetadata } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
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
		(await createTeamHistory(trx, {
			tournamentTeamId: args.tournamentTeamId,
			tournamentId: team.tournamentId,
			name: team.name,
		}));

	await trx
		.insertInto("TournamentAuditLog")
		.values({
			tournamentId: team.tournamentId,
			type: args.type,
			actorUserId: actorId(),
			subjectUserId: args.subjectUserId ?? null,
			tournamentTeamHistoryId,
			metadata: args.metadata ? JSON.stringify(args.metadata) : null,
			createdAt: databaseTimestampNow(),
		})
		.execute();
}

/**
 * Creates a fresh history row for a team and links it back from the team, so a
 * `TournamentTeam.id` reused by SQLite after a hard-deletion always gets its own
 * history row instead of inheriting the deleted team's identity. Returns the new
 * history id.
 */
async function createTeamHistory(
	trx: Transaction<DB>,
	{
		tournamentTeamId,
		tournamentId,
		name,
	}: { tournamentTeamId: number; tournamentId: number; name: string },
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
		.where("TournamentTeamHistory.id", "=", (eb) =>
			eb
				.selectFrom("TournamentTeam")
				.select("TournamentTeam.tournamentTeamHistoryId")
				.where("TournamentTeam.id", "=", tournamentTeamId),
		)
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

/** Counts audit log events for a tournament matching the same optional filters as {@link findByTournamentId}. Used for pagination. */
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

/** Returns every team (including deleted ones) that has appeared in the tournament's audit log, for the team filter dropdown. */
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

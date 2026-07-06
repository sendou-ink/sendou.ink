import { createHash } from "node:crypto";
import { type NotNull, sql } from "kysely";
import { db } from "~/db/sql";
import type { IngestableGame, IngestedWeaponRow } from "./core/Scoreboards";
import type { IngestedEventInput } from "./ingest-schemas";

const opponentOneId = sql<number>`"TournamentMatch"."opponentOne" ->> '$.id'`;
const opponentTwoId = sql<number>`"TournamentMatch"."opponentTwo" ->> '$.id'`;

/**
 * Stores raw ingested events. Events whose contents were stored before
 * (for the same tournament and POV user) are skipped.
 *
 * @returns count of newly stored events
 */
export async function addEvents({
	tournamentId,
	povUserId,
	submitterUserId,
	events,
}: {
	tournamentId: number | null;
	povUserId: number | null;
	submitterUserId: number | null;
	events: IngestedEventInput[];
}) {
	const result = await db
		.insertInto("IngestedEvent")
		.values(
			events.map((event) => ({
				tournamentId,
				povUserId,
				submitterUserId,
				type: event.type,
				t: event.t,
				confidence: event.confidence,
				data: JSON.stringify(event.data),
				detectedAt: event.detectedAt ?? null,
				eventHash: eventHash({ tournamentId, povUserId, event }),
			})),
		)
		.onConflict((oc) => oc.column("eventHash").doNothing())
		.execute();

	return result.reduce(
		(acc, cur) => acc + Number(cur.numInsertedOrUpdatedRows ?? 0),
		0,
	);
}

function eventHash({
	tournamentId,
	povUserId,
	event,
}: {
	tournamentId: number | null;
	povUserId: number | null;
	event: IngestedEventInput;
}) {
	return createHash("sha256")
		.update(
			JSON.stringify([
				tournamentId,
				povUserId,
				event.type,
				event.t,
				event.data,
			]),
		)
		.digest("hex");
}

/** Returns the games a user played in a tournament, in chronological order. */
export async function gamesPlayedByUserInTournament({
	userId,
	tournamentId,
}: {
	userId: number;
	tournamentId: number;
}): Promise<IngestableGame[]> {
	const rows = await db
		.selectFrom("TournamentMatchGameResultParticipant")
		.innerJoin(
			"TournamentMatchGameResult",
			"TournamentMatchGameResult.id",
			"TournamentMatchGameResultParticipant.matchGameResultId",
		)
		.innerJoin(
			"TournamentMatch",
			"TournamentMatch.id",
			"TournamentMatchGameResult.matchId",
		)
		.innerJoin(
			"TournamentStage",
			"TournamentStage.id",
			"TournamentMatch.stageId",
		)
		.select([
			"TournamentMatchGameResult.matchId as tournamentMatchId",
			"TournamentMatchGameResult.number",
			"TournamentMatchGameResult.mode",
			"TournamentMatchGameResult.stageId",
			"TournamentMatchGameResult.winnerTeamId",
			"TournamentMatchGameResult.createdAt as playedAt",
			opponentOneId.as("opponentOneId"),
			opponentTwoId.as("opponentTwoId"),
		])
		.where("TournamentMatchGameResultParticipant.userId", "=", userId)
		.where("TournamentStage.tournamentId", "=", tournamentId)
		.orderBy("TournamentMatchGameResult.createdAt", "asc")
		.orderBy("TournamentMatchGameResult.number", "asc")
		.execute();

	const inGameNamesByTeamId = await teamInGameNames(
		rows.flatMap((row) => [row.opponentOneId, row.opponentTwoId]),
	);

	return rows.map((row) => {
		const loserTeamId =
			row.winnerTeamId === row.opponentOneId
				? row.opponentTwoId
				: row.winnerTeamId === row.opponentTwoId
					? row.opponentOneId
					: null;

		return {
			tournamentMatchId: row.tournamentMatchId,
			mapIndex: row.number - 1,
			mode: row.mode,
			stageId: row.stageId,
			winnerTeamId: row.winnerTeamId,
			loserTeamId,
			winnerInGameNames: inGameNamesByTeamId.get(row.winnerTeamId) ?? [],
			loserInGameNames:
				(loserTeamId !== null
					? inGameNamesByTeamId.get(loserTeamId)
					: undefined) ?? [],
			playedAt: row.playedAt,
		};
	});
}

async function teamInGameNames(teamIds: Array<number | null>) {
	const uniqueTeamIds = [
		...new Set(teamIds.filter((id): id is number => id !== null)),
	];
	if (uniqueTeamIds.length === 0) return new Map<number, string[]>();

	const members = await db
		.selectFrom("TournamentTeamMember")
		.innerJoin("User", "User.id", "TournamentTeamMember.userId")
		.select([
			"TournamentTeamMember.tournamentTeamId",
			sql<
				string | null
			>`coalesce("TournamentTeamMember"."inGameName", "User"."inGameName")`.as(
				"inGameName",
			),
		])
		.where("TournamentTeamMember.tournamentTeamId", "in", uniqueTeamIds)
		.execute();

	const result = new Map<number, string[]>();
	for (const member of members) {
		if (!member.inGameName) continue;
		const names = result.get(member.tournamentTeamId) ?? [];
		names.push(member.inGameName);
		result.set(member.tournamentTeamId, names);
	}

	return result;
}

/** Returns the tournament's start time as a database timestamp. */
export async function tournamentStartTime(tournamentId: number) {
	const row = await db
		.selectFrom("CalendarEvent")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEventDate.eventId",
			"CalendarEvent.id",
		)
		.select(({ fn }) => fn.min("CalendarEventDate.startTime").as("startTime"))
		.where("CalendarEvent.tournamentId", "=", tournamentId)
		.executeTakeFirst();

	return row?.startTime ?? null;
}

/**
 * Inserts ingested weapon rows, skipping rows whose in-game name already has
 * a reported weapon for the same map (e.g. from an earlier ingest).
 *
 * @returns count of inserted rows
 */
export async function addReportedWeapons(rows: IngestedWeaponRow[]) {
	if (rows.length === 0) return 0;

	const matchIds = [...new Set(rows.map((row) => row.tournamentMatchId))];
	const existing = await db
		.selectFrom("ReportedWeapon")
		.select([
			"tournamentMatchId",
			"mapIndex",
			"ingestedInGameName",
			"ingestedTeamId",
		])
		.where("tournamentMatchId", "in", matchIds)
		.where("ingestedInGameName", "is not", null)
		.execute();

	const rowKey = (row: {
		tournamentMatchId: number | null;
		mapIndex: number;
		ingestedInGameName: string | null;
		ingestedTeamId: number | null;
	}) =>
		`${row.tournamentMatchId}-${row.mapIndex}-${row.ingestedTeamId}-${row.ingestedInGameName}`;

	const existingKeys = new Set(existing.map(rowKey));
	const newRows = rows.filter((row) => !existingKeys.has(rowKey(row)));

	if (newRows.length === 0) return 0;

	await db.insertInto("ReportedWeapon").values(newRows).execute();

	return newRows.length;
}

/** Returns a tournament match's ingested weapons (both linked to a user and not). */
export function findIngestedWeaponsByTournamentMatchId(
	tournamentMatchId: number,
) {
	return db
		.selectFrom("ReportedWeapon")
		.select([
			"ReportedWeapon.mapIndex",
			"ReportedWeapon.weaponSplId",
			"ReportedWeapon.ingestedInGameName",
			"ReportedWeapon.ingestedTeamId",
			"ReportedWeapon.userId",
		])
		.where("ReportedWeapon.tournamentMatchId", "=", tournamentMatchId)
		.where("ReportedWeapon.ingestedInGameName", "is not", null)
		.orderBy("ReportedWeapon.mapIndex", "asc")
		.$narrowType<{ ingestedInGameName: NotNull }>()
		.execute();
}

// xxx: probably would struggle with people with same name?

/**
 *  it's half-handled. Let me walk through the two variants, because they behave very differently.

Same name on opposite teams: handled. Every row carries ingestedTeamId (derived from scoreboard position + who won the game), so the two "Nayo"s produce distinct (name, team) identities. The dialog groups by team, so each appears under its own team section with its own select, and linkIngestedUser scopes the update by name and team. No collision anywhere.

Same name on the same team: stored, but linking breaks. Tracing it through:

1. Ingest: both scoreboard rows insert fine — there's no unique constraint on (match, mapIndex, name), and the userId uniques don't fire because userId is NULL (SQLite treats NULLs as distinct). Raw data preserved, weapons possibly different per row.
2. Dialog: resolveUnlinkedNames collapses them into one entry keyed by (name, teamId), with their weapons merged. You get a single select for what is physically two players — there's no way to express "row 2's Nayo is user A, row 3's Nayo is user B".
3. Linking — the actual bug: the update sets userId on every matching row. Two rows on the same (match, mapIndex) both get the same userId → violates unique(tournamentMatchId, mapIndex, userId) → the transaction rolls back and the user gets a generic error. So for that name, linking doesn't degrade gracefully — it just fails.

The deeper issue is that the ambiguity is unresolvable in principle: ReportedWeapon rows don't retain scoreboard row position, and even if they did, row position isn't a stable identity across games — so there's no honest way to say which weapon belonged to which of the two players, in this game or the next.

How likely is it? True duplicates in one lobby are rare, but note the OCR angle: emberz name reading can snap two different names to the same string, which makes this more common than the "two players genuinely named the same" case suggests.

Options as I see them:

- A. Drop ambiguous rows at ingest time. When a scoreboard has two identical (non-empty) names on the same side, skip those rows (keep the other 6–7 players). The raw event is stored anyway, so nothing is truly lost. This makes everything downstream consistent by construction: the dialog never shows an unlinkable entry, linking can never double-assign. Simple, honest — we refuse to attribute data we can't attribute.
- B. Keep the rows but harden linking. Store them, show the merged entry, and make linkIngestedUser assign at most one row per (match, mapIndex) (e.g. lowest rowid) and leave/delete the rest. No crash, but the attribution of the kept row is a coin flip, and the merged weapon display quietly mixes two players.
- C. Full modeling — add a row-index column, per-map link rows, "Nayo (2)" UI with multiple selects. Correct-ish within a single map but still can't track identity across games, and a lot of UX for a rare case.

My recommendation is A, plus a cheap defense-in-depth tweak to linkIngestedUser so it can never violate the unique constraint even if bad rows exist (from data ingested before the fix, or future regressions). One related small thing I'd fix in the same pass: the re-ingest skip key in addReportedWeapons is (match, mapIndex, name) without teamId, so an opposite-team duplicate that becomes readable only in a later re-ingest would get skipped — including teamId in that key closes it.
 */
/**
 * Thrown by linkIngestedUser when the target user is already attributed
 * another ingested name on one of the games the linked name appears in.
 */
export class IngestedLinkConflictError extends Error {}

/**
 * Connects an ingested in-game name to a sendou.ink user, filling
 * ReportedWeapon.userId for every match of the tournament where the name
 * played for the given team. Ingested rows that would duplicate a weapon the
 * user reported themselves are dropped instead. Linking a user who is already
 * attributed another ingested name on one of the games throws
 * IngestedLinkConflictError and rolls the whole link back.
 */
export function linkIngestedUser({
	tournamentId,
	ingestedInGameName,
	ingestedTeamId,
	userId,
}: {
	tournamentId: number;
	ingestedInGameName: string;
	ingestedTeamId: number | null;
	userId: number;
}) {
	return db.transaction().execute(async (trx) => {
		const tournamentMatchIds = trx
			.selectFrom("TournamentMatch")
			.innerJoin(
				"TournamentStage",
				"TournamentStage.id",
				"TournamentMatch.stageId",
			)
			.select("TournamentMatch.id")
			.where("TournamentStage.tournamentId", "=", tournamentId);

		await trx
			.deleteFrom("ReportedWeapon as ingested")
			.where("ingested.userId", "is", null)
			.where("ingested.ingestedInGameName", "=", ingestedInGameName)
			.where((eb) =>
				ingestedTeamId === null
					? eb("ingested.ingestedTeamId", "is", null)
					: eb("ingested.ingestedTeamId", "=", ingestedTeamId),
			)
			.where("ingested.tournamentMatchId", "in", tournamentMatchIds)
			.where(({ exists, selectFrom }) =>
				exists(
					selectFrom("ReportedWeapon as own")
						.select("own.mapIndex")
						.whereRef(
							"own.tournamentMatchId",
							"=",
							"ingested.tournamentMatchId",
						)
						.whereRef("own.mapIndex", "=", "ingested.mapIndex")
						.where("own.userId", "=", userId)
						.where("own.ingestedInGameName", "is", null),
				),
			)
			.execute();

		// xxx: why is this needed?
		// rows from before same-side duplicate names were dropped at ingest time
		// can still hold two rows on one (match, mapIndex); linking both would
		// violate unique(tournamentMatchId, mapIndex, userId), so keep only one
		await trx
			.deleteFrom("ReportedWeapon")
			.where(
				sql`rowid`,
				"in",
				trx
					.selectFrom("ReportedWeapon as ingested")
					.select(sql`"ingested"."rowid"`.as("rowid"))
					.where("ingested.userId", "is", null)
					.where("ingested.ingestedInGameName", "=", ingestedInGameName)
					.where((eb) =>
						ingestedTeamId === null
							? eb("ingested.ingestedTeamId", "is", null)
							: eb("ingested.ingestedTeamId", "=", ingestedTeamId),
					)
					.where("ingested.tournamentMatchId", "in", tournamentMatchIds)
					.where(({ exists, selectFrom }) =>
						exists(
							selectFrom("ReportedWeapon as other")
								.select("other.mapIndex")
								.whereRef(
									"other.tournamentMatchId",
									"=",
									"ingested.tournamentMatchId",
								)
								.whereRef("other.mapIndex", "=", "ingested.mapIndex")
								.whereRef(
									"other.ingestedInGameName",
									"=",
									"ingested.ingestedInGameName",
								)
								.where("other.userId", "is", null)
								.where(sql<boolean>`"other"."rowid" < "ingested"."rowid"`),
						),
					),
			)
			.execute();

		const conflictingRow = await trx
			.selectFrom("ReportedWeapon as ingested")
			.select("ingested.mapIndex")
			.where("ingested.userId", "is", null)
			.where("ingested.ingestedInGameName", "=", ingestedInGameName)
			.where((eb) =>
				ingestedTeamId === null
					? eb("ingested.ingestedTeamId", "is", null)
					: eb("ingested.ingestedTeamId", "=", ingestedTeamId),
			)
			.where("ingested.tournamentMatchId", "in", tournamentMatchIds)
			.where(({ exists, selectFrom }) =>
				exists(
					selectFrom("ReportedWeapon as own")
						.select("own.mapIndex")
						.whereRef(
							"own.tournamentMatchId",
							"=",
							"ingested.tournamentMatchId",
						)
						.whereRef("own.mapIndex", "=", "ingested.mapIndex")
						.where("own.userId", "=", userId),
				),
			)
			.limit(1)
			.executeTakeFirst();
		if (conflictingRow) {
			throw new IngestedLinkConflictError();
		}

		await trx
			.updateTable("ReportedWeapon")
			.set({ userId })
			.where("ReportedWeapon.userId", "is", null)
			.where("ReportedWeapon.ingestedInGameName", "=", ingestedInGameName)
			.where((eb) =>
				ingestedTeamId === null
					? eb("ReportedWeapon.ingestedTeamId", "is", null)
					: eb("ReportedWeapon.ingestedTeamId", "=", ingestedTeamId),
			)
			.where("ReportedWeapon.tournamentMatchId", "in", tournamentMatchIds)
			.execute();
	});
}

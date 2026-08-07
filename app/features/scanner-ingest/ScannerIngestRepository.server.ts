import { createHash } from "node:crypto";
import { subDays } from "date-fns";
import { sql, type Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import type { ScannerMatch } from "~/features/scanner/core/scanner-match";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as Matches from "./core/Matches";
import type {
	IngestableGame,
	IngestableGameWithContext,
	IngestContext,
} from "./core/Scoreboards";
import * as Scoreboards from "./core/Scoreboards";

const opponentOneId = sql<number>`"TournamentMatch"."opponentOne" ->> '$.id'`;
const opponentTwoId = sql<number>`"TournamentMatch"."opponentTwo" ->> '$.id'`;

/**
 * How far a stored match's playedAt may sit from an incoming one and still
 * be loaded as a merge candidate (content contradictions are checked by
 * Matches.isSameMatch; this only bounds the query).
 */
const MERGE_CANDIDATE_PLAYED_AT_WINDOW_DAYS = 1;
/** How recently a playedAt-less stored match must have been created to be a candidate. */
const MERGE_CANDIDATE_CREATED_AT_WINDOW_DAYS = 7;
const MERGE_CANDIDATE_LIMIT = 50;

/** How long before the events' timestamp their match may have started (long sets, swiss rounds get startedAt at creation). */
const MATCH_WINDOW_BEFORE_SECONDS = 4 * 60 * 60;
/** Event timestamps come from client clocks, so allow the match to have "started" a little after them. */
const MATCH_WINDOW_AFTER_SECONDS = 60 * 60;

/** SendouQ sets run well under this long; matches created further before the events cannot be theirs. */
const GROUP_MATCH_WINDOW_BEFORE_SECONDS = 2 * 60 * 60;
/** Event timestamps come from client clocks, so allow the match to have been created a little after them. */
const GROUP_MATCH_WINDOW_AFTER_SECONDS = 60 * 60;

/** Returns the games a user played in a tournament, in chronological order. */
export function gamesPlayedByUserInTournament(params: {
	userId: number;
	tournamentId: number;
}) {
	return tournamentGames(params);
}

/**
 * Returns the games a user played in any tournament since the given
 * database timestamp, in chronological order — tournament candidates for
 * content-based context resolution (Scoreboards.resolveContext).
 */
export function gamesPlayedByUserSince(params: {
	userId: number;
	/** database timestamp (seconds) */
	since: number;
}) {
	return tournamentGames(params);
}

/**
 * Returns the games of a tournament's casted sets (currently streamed ones
 * plus the cast history), in chronological order — the candidate set for
 * cast footage, whose submitter is staff rather than a player of the games.
 */
export async function castedGamesInTournament(tournamentId: number) {
	const tournament = await db
		.selectFrom("Tournament")
		.select("castedMatchesInfo")
		.where("Tournament.id", "=", tournamentId)
		.executeTakeFirst();
	const castedMatchesInfo = tournament?.castedMatchesInfo;

	const tournamentMatchIds = [
		...new Set([
			...(castedMatchesInfo?.castedMatches ?? []).map(
				(casted) => casted.matchId,
			),
			...(castedMatchesInfo?.castedMatchHistory ?? []).map(
				(casted) => casted.matchId,
			),
		]),
	];
	if (tournamentMatchIds.length === 0) return [];

	return tournamentGames({ tournamentId, tournamentMatchIds });
}

/** Returns a SendouQ match's games (its whole map list), in map order. */
export function gamesInGroupMatch(groupMatchId: number) {
	return sendouqGames({ groupMatchId });
}

/**
 * Returns the reported games of SendouQ matches a user played in since the
 * given database timestamp, in chronological order — SendouQ candidates for
 * content-based context resolution (Scoreboards.resolveContext).
 */
export function sendouqGamesPlayedByUserSince(params: {
	userId: number;
	/** database timestamp (seconds) */
	since: number;
}) {
	return sendouqGames(params);
}

/**
 * The tournament the user was (probably) playing in at the given wall-clock
 * time: their team is in a match whose `startedAt` is close enough before
 * `at`. When several qualify (rare) the latest-started one wins.
 */
export async function tournamentIdAt({
	userId,
	at,
}: {
	userId: number;
	/** wall-clock ms */
	at: number;
}) {
	const atSeconds = toDbTimestamp(at)!;

	const row = await db
		.selectFrom("TournamentTeamMember")
		.innerJoin(
			"TournamentTeam",
			"TournamentTeam.id",
			"TournamentTeamMember.tournamentTeamId",
		)
		.innerJoin(
			"TournamentStage",
			"TournamentStage.tournamentId",
			"TournamentTeam.tournamentId",
		)
		.innerJoin(
			"TournamentMatch",
			"TournamentMatch.stageId",
			"TournamentStage.id",
		)
		.select("TournamentTeam.tournamentId")
		.where("TournamentTeamMember.userId", "=", userId)
		.where((eb) =>
			eb.or([
				eb(opponentOneId, "=", eb.ref("TournamentTeam.id")),
				eb(opponentTwoId, "=", eb.ref("TournamentTeam.id")),
			]),
		)
		.where(
			"TournamentMatch.startedAt",
			"<=",
			atSeconds + MATCH_WINDOW_AFTER_SECONDS,
		)
		.where(
			"TournamentMatch.startedAt",
			">=",
			atSeconds - MATCH_WINDOW_BEFORE_SECONDS,
		)
		.orderBy("TournamentMatch.startedAt", "desc")
		.executeTakeFirst();

	return row?.tournamentId ?? null;
}

/**
 * The SendouQ match the user was (probably) playing at the given wall-clock
 * time: a group they are a member of is in a non-canceled match created
 * close enough before `at`. When several qualify the latest-created wins.
 */
export async function groupMatchIdAt({
	userId,
	at,
}: {
	userId: number;
	/** wall-clock ms */
	at: number;
}) {
	const atSeconds = toDbTimestamp(at)!;

	const row = await db
		.selectFrom("GroupMatch")
		.select("GroupMatch.id")
		.where((eb) =>
			eb.exists(
				eb
					.selectFrom("GroupMember")
					.select("GroupMember.userId")
					.where("GroupMember.userId", "=", userId)
					.where((memberEb) =>
						memberEb.or([
							memberEb(
								"GroupMember.groupId",
								"=",
								memberEb.ref("GroupMatch.alphaGroupId"),
							),
							memberEb(
								"GroupMember.groupId",
								"=",
								memberEb.ref("GroupMatch.bravoGroupId"),
							),
						]),
					),
			),
		)
		.where(
			"GroupMatch.createdAt",
			"<=",
			atSeconds + GROUP_MATCH_WINDOW_AFTER_SECONDS,
		)
		.where(
			"GroupMatch.createdAt",
			">=",
			atSeconds - GROUP_MATCH_WINDOW_BEFORE_SECONDS,
		)
		.where("GroupMatch.cancelAcceptedByUserId", "is", null)
		.orderBy("GroupMatch.createdAt", "desc")
		.executeTakeFirst();

	return row?.id ?? null;
}

/**
 * Tournaments running a match around the given wall-clock time that the
 * user helps run: they authored the event, are on its staff (organizer or
 * streamer), or hold an admin/organizer/streamer role in its organization.
 * The candidate contexts for cast footage.
 */
export async function staffTournamentIdsAt({
	userId,
	at,
}: {
	userId: number;
	/** wall-clock ms */
	at: number;
}): Promise<number[]> {
	const atSeconds = toDbTimestamp(at)!;

	const rows = await db
		.selectFrom("TournamentMatch")
		.innerJoin(
			"TournamentStage",
			"TournamentStage.id",
			"TournamentMatch.stageId",
		)
		.innerJoin(
			"CalendarEvent",
			"CalendarEvent.tournamentId",
			"TournamentStage.tournamentId",
		)
		.select("TournamentStage.tournamentId")
		.distinct()
		.where(
			"TournamentMatch.startedAt",
			"<=",
			atSeconds + MATCH_WINDOW_AFTER_SECONDS,
		)
		.where(
			"TournamentMatch.startedAt",
			">=",
			atSeconds - MATCH_WINDOW_BEFORE_SECONDS,
		)
		.where((eb) =>
			eb.or([
				eb("CalendarEvent.authorId", "=", userId),
				eb.exists(
					eb
						.selectFrom("TournamentStaff")
						.select("TournamentStaff.userId")
						.whereRef(
							"TournamentStaff.tournamentId",
							"=",
							"TournamentStage.tournamentId",
						)
						.where("TournamentStaff.userId", "=", userId),
				),
				eb.exists(
					eb
						.selectFrom("TournamentOrganizationMember")
						.select("TournamentOrganizationMember.userId")
						.whereRef(
							"TournamentOrganizationMember.organizationId",
							"=",
							"CalendarEvent.organizationId",
						)
						.where("TournamentOrganizationMember.userId", "=", userId)
						.where("TournamentOrganizationMember.role", "in", [
							"ADMIN",
							"ORGANIZER",
							"STREAMER",
						]),
				),
			]),
		)
		.execute();

	return rows.map((row) => row.tournamentId);
}

/**
 * Returns a tournament match's ingested scoreboards with their 0-based map
 * indexes, each derived from the game's linked ingested matches.
 */
export async function findScoreboardsByTournamentMatchId(
	tournamentMatchId: number,
) {
	const rows = await db
		.selectFrom("IngestedMatchLink")
		.innerJoin(
			"IngestedMatch",
			"IngestedMatch.id",
			"IngestedMatchLink.ingestedMatchId",
		)
		.innerJoin(
			"TournamentMatchGameResult",
			"TournamentMatchGameResult.id",
			"IngestedMatchLink.tournamentMatchGameResultId",
		)
		.innerJoin(
			"TournamentMatch",
			"TournamentMatch.id",
			"TournamentMatchGameResult.matchId",
		)
		.select([
			"TournamentMatchGameResult.id as matchGameResultId",
			"TournamentMatchGameResult.number",
			"TournamentMatchGameResult.winnerTeamId",
			opponentOneId.as("opponentOneId"),
			opponentTwoId.as("opponentTwoId"),
			"IngestedMatch.data",
			"IngestedMatch.povUserId",
		])
		.where("TournamentMatchGameResult.matchId", "=", tournamentMatchId)
		.orderBy("TournamentMatchGameResult.number", "asc")
		.orderBy("IngestedMatchLink.createdAt", "asc")
		.orderBy("IngestedMatchLink.id", "asc")
		.execute();

	const byGame = new Map<number, typeof rows>();
	for (const row of rows) {
		const gameRows = byGame.get(row.matchGameResultId) ?? [];
		gameRows.push(row);
		byGame.set(row.matchGameResultId, gameRows);
	}

	return [...byGame.values()].flatMap((gameRows) => {
		const first = gameRows[0]!;
		const loserTeamId =
			first.winnerTeamId === first.opponentOneId
				? first.opponentTwoId
				: first.winnerTeamId === first.opponentTwoId
					? first.opponentOneId
					: null;

		const data = Scoreboards.deriveScoreboardData({
			linked: gameRows.map((row) => ({
				data: row.data,
				povUserId: row.povUserId,
			})),
			winnerTeamId: first.winnerTeamId,
			loserTeamId,
		});
		if (!data) return [];

		return [{ mapIndex: first.number - 1, data }];
	});
}

/**
 * Stores ingested matches, merging partials: a match that
 * `Matches.isSameMatch` recognizes as an already stored one (same POV user
 * scope) enriches that row instead of inserting. Identical resends are
 * no-ops via the content hash. The resolved context is stamped onto the
 * rows as tournamentIdHint/groupMatchIdHint (existing hints win; missing
 * ones are backfilled even on no-op resends).
 *
 * @returns counts plus the post-merge rows (a partial arriving after an
 * earlier richer send links downstream with the merged, fuller data)
 */
export async function addOrMergeMatches({
	povUserId,
	submitterUserId,
	matches,
	context,
}: {
	povUserId: number | null;
	submitterUserId: number | null;
	matches: ScannerMatch[];
	context: IngestContext | null;
}) {
	const hints = {
		tournamentIdHint:
			context?.type === "tournament" ? context.tournamentId : null,
		groupMatchIdHint: context?.type === "sendouq" ? context.groupMatchId : null,
	};

	return db.transaction().execute(async (trx) => {
		let insertedCount = 0;
		let mergedCount = 0;
		const effectiveMatches: Array<{ id: number; data: ScannerMatch }> = [];

		for (const match of matches) {
			const effective = await addOrMergeMatch(trx, {
				povUserId,
				submitterUserId,
				match,
				hints,
			});
			if (effective.outcome === "inserted") insertedCount++;
			if (effective.outcome === "merged") mergedCount++;
			effectiveMatches.push({ id: effective.id, data: effective.data });
		}

		return { insertedCount, mergedCount, effectiveMatches };
	});
}

/**
 * Links ingested matches to the game results they were matched to. A row
 * links to at most one game (re-sends are no-ops); one game may collect
 * links from many rows (each POV's scan of it). When the row's POV player
 * is known, their weapon is reported as a regular ReportedWeapon, unless
 * the user already has one for that game.
 *
 * @returns count of newly created links
 */
export async function addLinks({
	links,
	povUserId,
}: {
	links: Array<{
		ingestedMatchId: number;
		match: ScannerMatch;
		game: IngestableGame;
	}>;
	povUserId: number | null;
}) {
	return db.transaction().execute(async (trx) => {
		let linkedCount = 0;

		for (const link of links) {
			const insertResult = await trx
				.insertInto("IngestedMatchLink")
				.values({
					ingestedMatchId: link.ingestedMatchId,
					tournamentMatchGameResultId:
						link.game.target.type === "tournament"
							? link.game.target.matchGameResultId
							: null,
					groupMatchMapId:
						link.game.target.type === "sendouq"
							? link.game.target.groupMatchMapId
							: null,
				})
				.onConflict((oc) => oc.column("ingestedMatchId").doNothing())
				.executeTakeFirst();

			await reportPovWeapon(trx, link, povUserId);

			if (Number(insertResult.numInsertedOrUpdatedRows ?? 0) > 0) {
				linkedCount++;
			}
		}

		return linkedCount;
	});
}

async function addOrMergeMatch(
	trx: Transaction<DB>,
	{
		povUserId,
		submitterUserId,
		match,
		hints,
	}: {
		povUserId: number | null;
		submitterUserId: number | null;
		match: ScannerMatch;
		hints: { tournamentIdHint: number | null; groupMatchIdHint: number | null };
	},
): Promise<{
	id: number;
	data: ScannerMatch;
	outcome: "inserted" | "merged" | "unchanged";
}> {
	const canonical = Matches.canonicalMatch(match);
	const hash = matchHash({ povUserId, match: canonical });

	const identical = await trx
		.selectFrom("IngestedMatch")
		.select(["id", "data", "tournamentIdHint", "groupMatchIdHint"])
		.where("matchHash", "=", hash)
		.executeTakeFirst();
	if (identical) {
		await backfillHints(trx, identical, hints);
		return { id: identical.id, data: identical.data, outcome: "unchanged" };
	}

	const stored = await findMergeCandidate(trx, {
		povUserId,
		match: canonical,
	});
	if (!stored) {
		const inserted = await trx
			.insertInto("IngestedMatch")
			.values({
				povUserId,
				submitterUserId,
				playedAt: toDbTimestamp(canonical.playedAt),
				data: JSON.stringify(canonical),
				matchHash: hash,
				...hints,
			})
			.returning("id")
			.executeTakeFirstOrThrow();
		return { id: inserted.id, data: canonical, outcome: "inserted" };
	}

	const { merged, changed } = Matches.mergeMatches(stored.data, canonical);
	if (!changed) {
		await backfillHints(trx, stored, hints);
		return { id: stored.id, data: stored.data, outcome: "unchanged" };
	}

	const mergedCanonical = Matches.canonicalMatch(merged);
	await trx
		.updateTable("IngestedMatch")
		.set({
			playedAt: toDbTimestamp(mergedCanonical.playedAt),
			data: JSON.stringify(mergedCanonical),
			matchHash: matchHash({ povUserId, match: mergedCanonical }),
			tournamentIdHint: stored.tournamentIdHint ?? hints.tournamentIdHint,
			groupMatchIdHint: stored.groupMatchIdHint ?? hints.groupMatchIdHint,
		})
		.where("id", "=", stored.id)
		.execute();
	return { id: stored.id, data: mergedCanonical, outcome: "merged" };
}

async function backfillHints(
	trx: Transaction<DB>,
	stored: {
		id: number;
		tournamentIdHint: number | null;
		groupMatchIdHint: number | null;
	},
	hints: { tournamentIdHint: number | null; groupMatchIdHint: number | null },
) {
	const tournamentIdHint = stored.tournamentIdHint ?? hints.tournamentIdHint;
	const groupMatchIdHint = stored.groupMatchIdHint ?? hints.groupMatchIdHint;
	if (
		tournamentIdHint === stored.tournamentIdHint &&
		groupMatchIdHint === stored.groupMatchIdHint
	) {
		return;
	}

	await trx
		.updateTable("IngestedMatch")
		.set({ tournamentIdHint, groupMatchIdHint })
		.where("id", "=", stored.id)
		.execute();
}

/**
 * The stored match the incoming one describes the same game as, if any:
 * rows in the same POV user scope, near in play time (or recent when either
 * side has none), content-checked by Matches.isSameMatch.
 */
async function findMergeCandidate(
	trx: Transaction<DB>,
	{
		povUserId,
		match,
	}: {
		povUserId: number | null;
		match: ScannerMatch;
	},
) {
	const createdAfter = dateToDatabaseTimestamp(
		subDays(new Date(), MERGE_CANDIDATE_CREATED_AT_WINDOW_DAYS),
	);

	// one query per branch (playedAt window / playedAt-less recent rows)
	// instead of an OR, so each can use the (povUserId, playedAt) index
	const baseQuery = trx
		.selectFrom("IngestedMatch")
		.select(["id", "data", "tournamentIdHint", "groupMatchIdHint", "createdAt"])
		.$if(povUserId === null, (qb) => qb.where("povUserId", "is", null))
		.$if(povUserId !== null, (qb) => qb.where("povUserId", "=", povUserId!))
		.orderBy("createdAt", "desc")
		.limit(MERGE_CANDIDATE_LIMIT);

	const candidates =
		match.playedAt === null
			? await baseQuery.where("createdAt", ">=", createdAfter).execute()
			: newestFirst(
					await baseQuery
						.where(
							"playedAt",
							">=",
							toDbTimestamp(
								subDays(
									match.playedAt,
									MERGE_CANDIDATE_PLAYED_AT_WINDOW_DAYS,
								).getTime(),
							),
						)
						.where(
							"playedAt",
							"<=",
							toDbTimestamp(match.playedAt)! +
								MERGE_CANDIDATE_PLAYED_AT_WINDOW_DAYS * 24 * 60 * 60,
						)
						.execute(),
					await baseQuery
						.where("playedAt", "is", null)
						.where("createdAt", ">=", createdAfter)
						.execute(),
				);

	return (
		candidates.find((candidate) =>
			Matches.isSameMatch(candidate.data, match),
		) ?? null
	);
}

function newestFirst<T extends { createdAt: number }>(a: T[], b: T[]): T[] {
	return [...a, ...b]
		.sort((x, y) => y.createdAt - x.createdAt)
		.slice(0, MERGE_CANDIDATE_LIMIT);
}

/** wall-clock ms → database timestamp (seconds) */
function toDbTimestamp(ms: number | null): number | null {
	return ms === null ? null : Math.floor(ms / 1000);
}

function matchHash({
	povUserId,
	match,
}: {
	povUserId: number | null;
	match: ScannerMatch;
}) {
	return createHash("sha256")
		.update(JSON.stringify([povUserId, match]))
		.digest("hex");
}

async function tournamentGames({
	userId,
	tournamentId,
	tournamentMatchIds,
	since,
}: {
	userId?: number;
	tournamentId?: number;
	tournamentMatchIds?: number[];
	since?: number;
}): Promise<IngestableGameWithContext[]> {
	const rows = await db
		.selectFrom("TournamentMatchGameResult")
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
			"TournamentMatchGameResult.id as matchGameResultId",
			"TournamentMatchGameResult.matchId as tournamentMatchId",
			"TournamentMatchGameResult.number",
			"TournamentMatchGameResult.mode",
			"TournamentMatchGameResult.stageId",
			"TournamentMatchGameResult.winnerTeamId",
			"TournamentMatchGameResult.createdAt as playedAt",
			"TournamentStage.tournamentId",
			opponentOneId.as("opponentOneId"),
			opponentTwoId.as("opponentTwoId"),
		])
		.$if(userId !== undefined, (qb) =>
			qb.where((eb) =>
				eb.exists(
					eb
						.selectFrom("TournamentMatchGameResultParticipant")
						.select("TournamentMatchGameResultParticipant.userId")
						.whereRef(
							"TournamentMatchGameResultParticipant.matchGameResultId",
							"=",
							"TournamentMatchGameResult.id",
						)
						.where("TournamentMatchGameResultParticipant.userId", "=", userId!),
				),
			),
		)
		.$if(tournamentId !== undefined, (qb) =>
			qb.where("TournamentStage.tournamentId", "=", tournamentId!),
		)
		.$if(tournamentMatchIds !== undefined, (qb) =>
			qb.where("TournamentMatchGameResult.matchId", "in", tournamentMatchIds!),
		)
		.$if(since !== undefined, (qb) =>
			qb.where("TournamentMatchGameResult.createdAt", ">=", since!),
		)
		.orderBy("TournamentMatchGameResult.createdAt", "asc")
		.orderBy("TournamentMatchGameResult.number", "asc")
		.execute();

	const inGameNamesByTeamId = await teamInGameNames(
		rows.flatMap((row) => [row.opponentOneId, row.opponentTwoId]),
	);
	const linkedNames = await linkedPlayerNamesByTarget(
		"tournamentMatchGameResultId",
		rows.map((row) => row.matchGameResultId),
	);

	return rows.map((row) => {
		const loserTeamId =
			row.winnerTeamId === row.opponentOneId
				? row.opponentTwoId
				: row.winnerTeamId === row.opponentTwoId
					? row.opponentOneId
					: null;

		return {
			target: {
				type: "tournament",
				matchGameResultId: row.matchGameResultId,
				tournamentMatchId: row.tournamentMatchId,
			},
			context: { type: "tournament", tournamentId: row.tournamentId },
			mapIndex: row.number - 1,
			mode: row.mode,
			stageId: row.stageId,
			winnerInGameNames: inGameNamesByTeamId.get(row.winnerTeamId) ?? [],
			loserInGameNames:
				(loserTeamId !== null
					? inGameNamesByTeamId.get(loserTeamId)
					: undefined) ?? [],
			playedAt: row.playedAt,
			linkedPlayerNames: linkedNames.get(row.matchGameResultId) ?? null,
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

async function sendouqGames({
	groupMatchId,
	userId,
	since,
}: {
	groupMatchId?: number;
	userId?: number;
	since?: number;
}): Promise<IngestableGameWithContext[]> {
	const rows = await db
		.selectFrom("GroupMatchMap")
		.innerJoin("GroupMatch", "GroupMatch.id", "GroupMatchMap.matchId")
		.select([
			"GroupMatchMap.id as groupMatchMapId",
			"GroupMatchMap.matchId as groupMatchId",
			"GroupMatchMap.index as mapIndex",
			"GroupMatchMap.mode",
			"GroupMatchMap.stageId",
			"GroupMatchMap.winnerGroupId",
			"GroupMatch.alphaGroupId",
			"GroupMatch.bravoGroupId",
			"GroupMatch.createdAt as playedAt",
		])
		.$if(groupMatchId !== undefined, (qb) =>
			qb.where("GroupMatchMap.matchId", "=", groupMatchId!),
		)
		.$if(userId !== undefined, (qb) =>
			qb.where((eb) =>
				eb.exists(
					eb
						.selectFrom("GroupMember")
						.select("GroupMember.userId")
						.where("GroupMember.userId", "=", userId!)
						.where((memberEb) =>
							memberEb.or([
								memberEb(
									"GroupMember.groupId",
									"=",
									memberEb.ref("GroupMatch.alphaGroupId"),
								),
								memberEb(
									"GroupMember.groupId",
									"=",
									memberEb.ref("GroupMatch.bravoGroupId"),
								),
							]),
						),
				),
			),
		)
		// content resolution walks played games only; a current match's
		// pre-generated unplayed maps would flood the candidate sequence
		.$if(since !== undefined, (qb) =>
			qb
				.where("GroupMatch.createdAt", ">=", since!)
				.where("GroupMatchMap.winnerGroupId", "is not", null),
		)
		.orderBy("GroupMatch.createdAt", "asc")
		.orderBy("GroupMatchMap.index", "asc")
		.execute();

	const inGameNamesByGroupId = await groupInGameNames(
		rows.flatMap((row) => [row.alphaGroupId, row.bravoGroupId]),
	);
	const linkedNames = await linkedPlayerNamesByTarget(
		"groupMatchMapId",
		rows.map((row) => row.groupMatchMapId),
	);

	return rows.map((row) => {
		const loserGroupId =
			row.winnerGroupId === row.alphaGroupId
				? row.bravoGroupId
				: row.winnerGroupId === row.bravoGroupId
					? row.alphaGroupId
					: null;

		return {
			target: {
				type: "sendouq",
				groupMatchMapId: row.groupMatchMapId,
				groupMatchId: row.groupMatchId,
			},
			context: { type: "sendouq", groupMatchId: row.groupMatchId },
			mapIndex: row.mapIndex,
			mode: row.mode,
			stageId: row.stageId,
			winnerInGameNames:
				(row.winnerGroupId !== null
					? inGameNamesByGroupId.get(row.winnerGroupId)
					: undefined) ?? [],
			loserInGameNames:
				(loserGroupId !== null
					? inGameNamesByGroupId.get(loserGroupId)
					: undefined) ?? [],
			playedAt: row.playedAt,
			linkedPlayerNames: linkedNames.get(row.groupMatchMapId) ?? null,
		};
	});
}

async function groupInGameNames(groupIds: number[]) {
	const uniqueGroupIds = [...new Set(groupIds)];
	if (uniqueGroupIds.length === 0) return new Map<number, string[]>();

	const members = await db
		.selectFrom("GroupMember")
		.innerJoin("User", "User.id", "GroupMember.userId")
		.select(["GroupMember.groupId", "User.inGameName"])
		.where("GroupMember.groupId", "in", uniqueGroupIds)
		.execute();

	const result = new Map<number, string[]>();
	for (const member of members) {
		if (!member.inGameName) continue;
		const names = result.get(member.groupId) ?? [];
		names.push(member.inGameName);
		result.set(member.groupId, names);
	}

	return result;
}

/**
 * The winner-first player names of each game's earliest linked ingested
 * match, keyed by the given link target column's value.
 */
async function linkedPlayerNamesByTarget(
	column: "tournamentMatchGameResultId" | "groupMatchMapId",
	targetIds: number[],
) {
	const result = new Map<number, string[]>();
	if (targetIds.length === 0) return result;

	const rows = await db
		.selectFrom("IngestedMatchLink")
		.innerJoin(
			"IngestedMatch",
			"IngestedMatch.id",
			"IngestedMatchLink.ingestedMatchId",
		)
		.select([`IngestedMatchLink.${column} as targetId`, "IngestedMatch.data"])
		.where(`IngestedMatchLink.${column}`, "in", targetIds)
		.orderBy("IngestedMatchLink.createdAt", "asc")
		.orderBy("IngestedMatchLink.id", "asc")
		.execute();

	for (const row of rows) {
		if (row.targetId === null || result.has(row.targetId)) continue;
		const names = Scoreboards.winnerFirstPlayerNames(row.data);
		if (names) result.set(row.targetId, names);
	}

	return result;
}

async function reportPovWeapon(
	trx: Transaction<DB>,
	{ match, game }: { match: ScannerMatch; game: IngestableGame },
	povUserId: number | null,
) {
	if (povUserId === null || match.pov === null) return;
	const weaponSplId =
		match.teams[match.pov.team]?.players[match.pov.index]?.weaponId ?? null;
	if (weaponSplId === null) return;

	await trx
		.insertInto("ReportedWeapon")
		.values({
			tournamentMatchId:
				game.target.type === "tournament"
					? game.target.tournamentMatchId
					: null,
			groupMatchId:
				game.target.type === "sendouq" ? game.target.groupMatchId : null,
			mapIndex: game.mapIndex,
			userId: povUserId,
			weaponSplId,
		})
		.onConflict((oc) =>
			oc
				.columns(
					game.target.type === "tournament"
						? ["tournamentMatchId", "mapIndex", "userId"]
						: ["groupMatchId", "mapIndex", "userId"],
				)
				.doNothing(),
		)
		.execute();
}

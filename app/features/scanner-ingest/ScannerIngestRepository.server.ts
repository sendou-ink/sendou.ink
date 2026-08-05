import { createHash } from "node:crypto";
import { subDays } from "date-fns";
import { sql, type Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import type { ScannerMatch } from "~/features/scanner/core/scanner-match";
import * as Matches from "./core/Matches";
import type {
	IngestableGameWithTournament,
	IngestedScoreboardData,
	MatchedScoreboard,
} from "./core/Scoreboards";

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

/**
 * Stores ingested matches, merging partials: a match that
 * `Matches.isSameMatch` recognizes as an already stored one (same
 * tournament + POV user scope) enriches that row instead of inserting.
 * Identical resends are no-ops via the content hash.
 *
 * @returns counts plus the post-merge matches (a partial arriving after an
 * earlier richer send attaches downstream with the merged, fuller data)
 */
export async function addOrMergeMatches({
	tournamentId,
	povUserId,
	submitterUserId,
	matches,
}: {
	tournamentId: number | null;
	povUserId: number | null;
	submitterUserId: number | null;
	matches: ScannerMatch[];
}) {
	let insertedCount = 0;
	let mergedCount = 0;
	const effectiveMatches: ScannerMatch[] = [];

	for (const match of matches) {
		const canonical = Matches.canonicalMatch(match);
		const hash = matchHash({ tournamentId, povUserId, match: canonical });

		const effective = await db.transaction().execute(async (trx) => {
			const identical = await trx
				.selectFrom("IngestedMatch")
				.select("data")
				.where("matchHash", "=", hash)
				.executeTakeFirst();
			if (identical) return identical.data;

			const stored = await findMergeCandidate(trx, {
				tournamentId,
				povUserId,
				match: canonical,
			});
			if (!stored) {
				const inserted = await trx
					.insertInto("IngestedMatch")
					.values({
						tournamentId,
						povUserId,
						submitterUserId,
						playedAt: toDbTimestamp(canonical.playedAt),
						data: JSON.stringify(canonical),
						matchHash: hash,
					})
					.onConflict((oc) => oc.column("matchHash").doNothing())
					.executeTakeFirst();
				if (Number(inserted.numInsertedOrUpdatedRows ?? 0) > 0) {
					insertedCount++;
				}
				return canonical;
			}

			const { merged, changed } = Matches.mergeMatches(stored.data, canonical);
			if (!changed) return stored.data;

			const mergedCanonical = Matches.canonicalMatch(merged);
			await trx
				.updateTable("IngestedMatch")
				.set({
					playedAt: toDbTimestamp(mergedCanonical.playedAt),
					data: JSON.stringify(mergedCanonical),
					matchHash: matchHash({
						tournamentId,
						povUserId,
						match: mergedCanonical,
					}),
				})
				.where("id", "=", stored.id)
				.execute();
			mergedCount++;
			return mergedCanonical;
		});

		effectiveMatches.push(effective);
	}

	return { insertedCount, mergedCount, effectiveMatches };
}

/**
 * The stored match the incoming one describes the same game as, if any:
 * rows in the same tournament + POV user scope, near in play time (or
 * recent when either side has none), content-checked by Matches.isSameMatch.
 */
async function findMergeCandidate(
	trx: Transaction<DB>,
	{
		tournamentId,
		povUserId,
		match,
	}: {
		tournamentId: number | null;
		povUserId: number | null;
		match: ScannerMatch;
	},
) {
	const createdAfter = Math.floor(
		subDays(new Date(), MERGE_CANDIDATE_CREATED_AT_WINDOW_DAYS).getTime() /
			1000,
	);

	const candidates = await trx
		.selectFrom("IngestedMatch")
		.select(["id", "data"])
		.$if(tournamentId === null, (qb) => qb.where("tournamentId", "is", null))
		.$if(tournamentId !== null, (qb) =>
			qb.where("tournamentId", "=", tournamentId!),
		)
		.$if(povUserId === null, (qb) => qb.where("povUserId", "is", null))
		.$if(povUserId !== null, (qb) => qb.where("povUserId", "=", povUserId!))
		.$if(match.playedAt !== null, (qb) =>
			qb.where((eb) =>
				eb.or([
					eb.and([
						eb(
							"playedAt",
							">=",
							toDbTimestamp(
								subDays(
									match.playedAt!,
									MERGE_CANDIDATE_PLAYED_AT_WINDOW_DAYS,
								).getTime(),
							),
						),
						eb(
							"playedAt",
							"<=",
							toDbTimestamp(match.playedAt!)! +
								MERGE_CANDIDATE_PLAYED_AT_WINDOW_DAYS * 24 * 60 * 60,
						),
					]),
					eb.and([
						eb("playedAt", "is", null),
						eb("createdAt", ">=", createdAfter),
					]),
				]),
			),
		)
		.$if(match.playedAt === null, (qb) =>
			qb.where("createdAt", ">=", createdAfter),
		)
		.orderBy("createdAt", "desc")
		.limit(MERGE_CANDIDATE_LIMIT)
		.execute();

	return (
		candidates.find((candidate) =>
			Matches.isSameMatch(candidate.data, match),
		) ?? null
	);
}

/** wall-clock ms → database timestamp (seconds) */
function toDbTimestamp(ms: number | null): number | null {
	return ms === null ? null : Math.floor(ms / 1000);
}

function matchHash({
	tournamentId,
	povUserId,
	match,
}: {
	tournamentId: number | null;
	povUserId: number | null;
	match: ScannerMatch;
}) {
	return createHash("sha256")
		.update(JSON.stringify([tournamentId, povUserId, match]))
		.digest("hex");
}

/** Returns the games a user played in a tournament, in chronological order. */
export function gamesPlayedByUserInTournament(params: {
	userId: number;
	tournamentId: number;
}) {
	return gamesPlayedByUser(params);
}

/**
 * Returns the games a user played in any tournament since the given
 * database timestamp, in chronological order — the candidate set for
 * content-based tournament resolution (Scoreboards.resolveTournamentId).
 */
export function gamesPlayedByUserSince(params: {
	userId: number;
	/** database timestamp (seconds) */
	since: number;
}) {
	return gamesPlayedByUser(params);
}

async function gamesPlayedByUser({
	userId,
	tournamentId,
	since,
}: {
	userId: number;
	tournamentId?: number;
	since?: number;
}): Promise<IngestableGameWithTournament[]> {
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
		.leftJoin(
			"IngestedScoreboard",
			"IngestedScoreboard.matchGameResultId",
			"TournamentMatchGameResult.id",
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
			"IngestedScoreboard.data as storedScoreboardData",
			opponentOneId.as("opponentOneId"),
			opponentTwoId.as("opponentTwoId"),
		])
		.where("TournamentMatchGameResultParticipant.userId", "=", userId)
		.$if(tournamentId !== undefined, (qb) =>
			qb.where("TournamentStage.tournamentId", "=", tournamentId!),
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

	return rows.map((row) => {
		const loserTeamId =
			row.winnerTeamId === row.opponentOneId
				? row.opponentTwoId
				: row.winnerTeamId === row.opponentTwoId
					? row.opponentOneId
					: null;

		return {
			matchGameResultId: row.matchGameResultId,
			tournamentMatchId: row.tournamentMatchId,
			tournamentId: row.tournamentId,
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
			storedScoreboardPlayerNames:
				row.storedScoreboardData?.players.map((player) => player.name) ?? null,
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

/** How long before the events' timestamp their match may have started (long sets, swiss rounds get startedAt at creation). */
const MATCH_WINDOW_BEFORE_SECONDS = 4 * 60 * 60;
/** Event timestamps come from client clocks, so allow the match to have "started" a little after them. */
const MATCH_WINDOW_AFTER_SECONDS = 60 * 60;

/**
 * The tournament the user was (probably) playing in at the given wall-clock
 * time: their team is in a match whose `startedAt` is close enough before
 * `at`. When several qualify (rare) the latest-started one wins.
 */
// xxx: change it to more generic. user id + stage + mode + startedAt -> what scrim, sq, tournament if any?
export async function tournamentIdAt({
	userId,
	at,
}: {
	userId: number;
	/** wall-clock ms */
	at: number;
}) {
	const atSeconds = Math.floor(at / 1000);

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

/** Returns the tournament's start time as a database timestamp. */
export async function tournamentStartTime(tournamentId: number) {
	const row = await db
		.selectFrom("CalendarEvent")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEventDate.eventId",
			"CalendarEvent.id",
		)
		.select(({ fn }) => fn.min("CalendarEventDate.startsAt").as("startTime"))
		.where("CalendarEvent.tournamentId", "=", tournamentId)
		.executeTakeFirst();

	return row?.startTime ?? null;
}

/**
 * Stores matched scoreboards. A game that already has a stored scoreboard
 * keeps it (first ingest wins). When the scoreboard's POV player is known
 * (via povIndex + povUserId), their row is attributed to the user and their
 * weapon is reported as a regular ReportedWeapon, unless the user already
 * has one for that game.
 *
 * @returns count of newly stored scoreboards
 */
export async function addScoreboards({
	scoreboards,
	povUserId,
}: {
	scoreboards: MatchedScoreboard[];
	povUserId: number | null;
}) {
	let storedCount = 0;

	for (const scoreboard of scoreboards) {
		const wasInserted = await db.transaction().execute(async (trx) => {
			const povPlayer =
				povUserId !== null && scoreboard.povIndex !== null
					? scoreboard.data.players[scoreboard.povIndex]
					: undefined;

			const data: IngestedScoreboardData = povPlayer
				? {
						...scoreboard.data,
						players: scoreboard.data.players.map((player, playerIdx) =>
							playerIdx === scoreboard.povIndex
								? { ...player, userId: povUserId! }
								: player,
						),
					}
				: scoreboard.data;

			const insertResult = await trx
				.insertInto("IngestedScoreboard")
				.values({
					matchGameResultId: scoreboard.matchGameResultId,
					data: JSON.stringify(data),
				})
				.onConflict((oc) => oc.column("matchGameResultId").doNothing())
				.executeTakeFirst();
			const inserted = Number(insertResult.numInsertedOrUpdatedRows ?? 0) > 0;

			if (!povPlayer) return inserted;

			if (!inserted) {
				await attributePovUser({
					trx,
					matchGameResultId: scoreboard.matchGameResultId,
					povIndex: scoreboard.povIndex!,
					userId: povUserId!,
				});
			}

			if (povPlayer.weaponSplId !== null) {
				await trx
					.insertInto("ReportedWeapon")
					.values({
						tournamentMatchId: scoreboard.tournamentMatchId,
						mapIndex: scoreboard.mapIndex,
						userId: povUserId!,
						weaponSplId: povPlayer.weaponSplId,
					})
					.onConflict((oc) =>
						oc.columns(["tournamentMatchId", "mapIndex", "userId"]).doNothing(),
					)
					.execute();
			}

			return inserted;
		});

		if (wasInserted) storedCount++;
	}

	return storedCount;
}

async function attributePovUser({
	trx,
	matchGameResultId,
	povIndex,
	userId,
}: {
	trx: Transaction<DB>;
	matchGameResultId: number;
	povIndex: number;
	userId: number;
}) {
	const existing = await trx
		.selectFrom("IngestedScoreboard")
		.select(["id", "data"])
		.where("matchGameResultId", "=", matchGameResultId)
		.executeTakeFirst();
	if (!existing) return;

	if (existing.data.players.some((player) => player.userId === userId)) {
		return;
	}

	const player = existing.data.players[povIndex];
	if (!player || player.userId !== undefined) return;

	const players = existing.data.players.map((other, playerIdx) =>
		playerIdx === povIndex ? { ...other, userId } : other,
	);

	await trx
		.updateTable("IngestedScoreboard")
		.set({ data: JSON.stringify({ ...existing.data, players }) })
		.where("id", "=", existing.id)
		.execute();
}

/** Returns a tournament match's ingested scoreboards with their 0-based map indexes. */
export async function findScoreboardsByTournamentMatchId(
	tournamentMatchId: number,
) {
	const rows = await db
		.selectFrom("IngestedScoreboard")
		.innerJoin(
			"TournamentMatchGameResult",
			"TournamentMatchGameResult.id",
			"IngestedScoreboard.matchGameResultId",
		)
		.select(["TournamentMatchGameResult.number", "IngestedScoreboard.data"])
		.where("TournamentMatchGameResult.matchId", "=", tournamentMatchId)
		.orderBy("TournamentMatchGameResult.number", "asc")
		.execute();

	return rows.map((row) => ({
		mapIndex: row.number - 1,
		data: row.data,
	}));
}

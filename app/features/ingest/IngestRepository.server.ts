import { createHash } from "node:crypto";
import { sql, type Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import type {
	IngestableGameWithTournament,
	IngestedScoreboardData,
	MatchedScoreboard,
} from "./core/Scoreboards";
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
		.select(({ fn }) => fn.min("CalendarEventDate.startTime").as("startTime"))
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

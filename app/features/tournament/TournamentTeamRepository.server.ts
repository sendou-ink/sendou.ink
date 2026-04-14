import type { Transaction } from "kysely";
import { sql } from "kysely";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import type { MapPool } from "~/features/map-list-generator/core/map-pool";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { flatZip } from "~/utils/arrays";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import invariant from "~/utils/invariant";

export function setActiveRoster({
	teamId,
	activeRosterUserIds,
}: {
	teamId: number;
	activeRosterUserIds: number[] | null;
}) {
	return db
		.updateTable("TournamentTeam")
		.set({
			activeRosterUserIds: activeRosterUserIds
				? JSON.stringify(activeRosterUserIds)
				: null,
		})
		.where("TournamentTeam.id", "=", teamId)
		.execute();
}

const regOpenTournamentTeamsByJoinedUserId = (userId: number) =>
	db
		.selectFrom("TournamentTeamMember")
		.innerJoin(
			"TournamentTeam",
			"TournamentTeam.id",
			"TournamentTeamMember.tournamentTeamId",
		)
		.innerJoin("Tournament", "Tournament.id", "TournamentTeam.tournamentId")
		.innerJoin("CalendarEvent", "CalendarEvent.tournamentId", "Tournament.id")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEventDate.eventId",
			"CalendarEvent.id",
		)
		.select([
			"TournamentTeam.tournamentId",
			"TournamentTeamMember.tournamentTeamId",
		])
		.where("TournamentTeamMember.userId", "=", userId)
		.where(
			sql`coalesce(
      "Tournament"."settings" ->> 'regClosesAt', 
      "CalendarEventDate"."startTime"
    )`,
			">",
			databaseTimestampNow(),
		)
		.execute();

export async function updateMemberInGameName({
	userId,
	inGameName,
	tournamentTeamId,
}: {
	userId: number;
	inGameName: string;
	tournamentTeamId: number;
}) {
	return db
		.updateTable("TournamentTeamMember")
		.set({ inGameName })
		.where("TournamentTeamMember.userId", "=", userId)
		.where("TournamentTeamMember.tournamentTeamId", "=", tournamentTeamId)
		.execute();
}

/**
 * Updates the in-game name of a tournament team member for tournaments that have not started yet.
 *
 * @returns A promise that resolves to an array of tournament IDs where the user's in-game name was updated.
 */
export async function updateMemberInGameNameForNonStarted({
	userId,
	inGameName,
}: {
	/** The ID of the user whose in-game name is to be updated. */
	userId: number;
	/** The new in-game name to be set for the user. */
	inGameName: string;
}): Promise<number[]> {
	const tournamentTeams = await regOpenTournamentTeamsByJoinedUserId(userId);

	await db
		.updateTable("TournamentTeamMember")
		.set({ inGameName })
		.where("TournamentTeamMember.userId", "=", userId)
		// after they have checked in no longer can update their IGN from here
		.where(
			"TournamentTeamMember.tournamentTeamId",
			"in",
			tournamentTeams.map((t) => t.tournamentTeamId),
		)
		// if the tournament doesn't have the setting to require IGN, ignore
		.where("TournamentTeamMember.inGameName", "is not", null)
		.execute();

	return tournamentTeams.map((t) => t.tournamentId);
}

export function create({
	team,
	avatarFileName,
	userId,
	tournamentId,
}: {
	team: Pick<Tables["TournamentTeam"], "name" | "prefersNotToHost" | "teamId">;
	avatarFileName?: string;
	userId: number;
	tournamentId: number;
}) {
	return db.transaction().execute(async (trx) => {
		const avatarImgId = avatarFileName
			? await createSubmittedImageInTrx({
					trx,
					avatarFileName,
					userId,
				})
			: null;

		const tournamentTeam = await trx
			.insertInto("TournamentTeam")
			.values({
				tournamentId,
				name: team.name,
				inviteCode: shortNanoid(),
				prefersNotToHost: team.prefersNotToHost,
				teamId: team.teamId,
				avatarImgId,
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		const inGameName = await resolveInGameName(trx, tournamentId, userId);

		await trx
			.insertInto("TournamentTeamMember")
			.values({
				tournamentTeamId: tournamentTeam.id,
				userId,
				role: "OWNER",
				inGameName,
			})
			.execute();

		return tournamentTeam;
	});
}

async function resolveInGameName(
	trx: Transaction<DB>,
	tournamentId: number,
	userId: number,
) {
	const tournament = await trx
		.selectFrom("Tournament")
		.select("Tournament.settings")
		.where("Tournament.id", "=", tournamentId)
		.executeTakeFirstOrThrow();

	if (!tournament.settings.requireInGameNames) return null;

	const user = await trx
		.selectFrom("User")
		.select("User.inGameName")
		.where("User.id", "=", userId)
		.executeTakeFirstOrThrow();

	return user.inGameName;
}

export function copyFromAnotherTournament({
	tournamentTeamId,
	destinationTournamentId,
	seed,
	defaultCheckedIn = false,
}: {
	tournamentTeamId: number;
	destinationTournamentId: number;
	seed?: number;
	defaultCheckedIn?: boolean;
}) {
	return db.transaction().execute(async (trx) => {
		const oldTeam = await trx
			.selectFrom("TournamentTeam")
			.select([
				"TournamentTeam.avatarImgId",
				"TournamentTeam.createdAt",
				"TournamentTeam.name",
				"TournamentTeam.prefersNotToHost",
				"TournamentTeam.teamId",

				// -- exclude these
				// "TournamentTeam.id"
				// "TournamentTeam.droppedOut"
				// "TournamentTeam.activeRosterUserIds"
				// "TournamentTeam.seed"
				// "TournamentTeam.startingBracketIdx"
				// "TournamentTeam.inviteCode"
				// "TournamentTeam.tournamentId"
				// "TournamentTeam.activeRosterUserIds",
			])
			.where("id", "=", tournamentTeamId)
			.executeTakeFirstOrThrow();

		const oldMembers = await trx
			.selectFrom("TournamentTeamMember")
			.select([
				"TournamentTeamMember.createdAt",
				"TournamentTeamMember.inGameName",
				"TournamentTeamMember.role",
				"TournamentTeamMember.userId",

				// -- exclude these
				// "TournamentTeamMember.tournamentTeamId"
			])
			.where("tournamentTeamId", "=", tournamentTeamId)
			.execute();
		invariant(oldMembers.length > 0, "Team has no members");

		const oldMapPool = await trx
			.selectFrom("MapPoolMap")
			.select(["MapPoolMap.mode", "MapPoolMap.stageId"])
			.where("tournamentTeamId", "=", tournamentTeamId)
			.execute();

		const newTeam = await trx
			.insertInto("TournamentTeam")
			.values({
				...oldTeam,
				tournamentId: destinationTournamentId,
				inviteCode: shortNanoid(),
				seed,
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		if (defaultCheckedIn) {
			await trx
				.insertInto("TournamentTeamCheckIn")
				.values({
					checkedInAt: databaseTimestampNow(),
					tournamentTeamId: newTeam.id,
					bracketIdx: null,
				})
				.execute();
		}

		await trx
			.insertInto("TournamentTeamMember")
			.values(
				oldMembers.map((member) => ({
					...member,
					tournamentTeamId: newTeam.id,
				})),
			)
			.execute();

		if (oldMapPool.length > 0) {
			await trx
				.insertInto("MapPoolMap")
				.values(
					oldMapPool.map((mapPoolMap) => ({
						...mapPoolMap,
						tournamentTeamId: newTeam.id,
					})),
				)
				.execute();
		}
	});
}

export function update({
	team,
	avatarFileName,
	userId,
}: {
	team: Pick<
		Tables["TournamentTeam"],
		"id" | "name" | "prefersNotToHost" | "teamId"
	>;
	avatarFileName?: string;
	userId: number;
}) {
	return db.transaction().execute(async (trx) => {
		const avatarImgId = avatarFileName
			? await createSubmittedImageInTrx({
					trx,
					avatarFileName,
					userId,
				})
			: team.teamId
				? // clear pickup avatar when switching to team signup, as team logo will be used
					null
				: // don't overwrite the existing avatarImgId even if no new avatar is provided
					// delete is a separate functionality
					undefined;

		await trx
			.updateTable("TournamentTeam")
			.set({
				name: team.name,
				prefersNotToHost: team.prefersNotToHost,
				teamId: team.teamId,
				avatarImgId,
			})
			.where("TournamentTeam.id", "=", team.id)
			.execute();
	});
}

async function createSubmittedImageInTrx({
	trx,
	avatarFileName,
	userId,
}: {
	trx: Transaction<DB>;
	avatarFileName: string;
	userId: number;
}) {
	const result = await trx
		.insertInto("UnvalidatedUserSubmittedImage")
		.values({
			url: avatarFileName,
			// in the context of tournament teams images are treated as globally "validated"
			// instead the TO takes responsibility for removing inappropriate images
			validatedAt: databaseTimestampNow(),
			submitterUserId: userId,
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	return result.id;
}

export function deleteLogo(tournamentTeamId: number) {
	return db
		.updateTable("TournamentTeam")
		.set({ avatarImgId: null })
		.where("TournamentTeam.id", "=", tournamentTeamId)
		.execute();
}

export function updateStartingBrackets(
	startingBrackets: {
		tournamentTeamId: number;
		startingBracketIdx: number;
	}[],
) {
	const grouped = Object.groupBy(
		startingBrackets,
		(sb) => sb.startingBracketIdx,
	);

	return db.transaction().execute(async (trx) => {
		for (const [startingBracketIdx, tournamentTeamIds = []] of Object.entries(
			grouped,
		)) {
			await trx
				.updateTable("TournamentTeam")
				.set({ startingBracketIdx: Number(startingBracketIdx) })
				.where(
					"TournamentTeam.id",
					"in",
					tournamentTeamIds.map((t) => t.tournamentTeamId),
				)
				.execute();
		}
	});
}

/**
 * Checks in a tournament team. Clears any existing check-out records before inserting the check-in.
 * When called without `bracketIdx`, checks in for the whole tournament.
 * When called with `bracketIdx`, checks in for a specific bracket (e.g. after progression).
 */
export function checkIn(
	tournamentTeamId: number,
	options?: { bracketIdx: number },
) {
	const bracketIdx = options?.bracketIdx ?? null;

	return db.transaction().execute(async (trx) => {
		let query = trx
			.deleteFrom("TournamentTeamCheckIn")
			.where("TournamentTeamCheckIn.tournamentTeamId", "=", tournamentTeamId)
			.where("TournamentTeamCheckIn.isCheckOut", "=", 1);

		if (typeof bracketIdx === "number") {
			query = query.where("TournamentTeamCheckIn.bracketIdx", "=", bracketIdx);
		}

		await query.execute();

		await trx
			.insertInto("TournamentTeamCheckIn")
			.values({
				checkedInAt: dateToDatabaseTimestamp(new Date()),
				tournamentTeamId,
				bracketIdx,
			})
			.execute();
	});
}

export function checkOut({
	tournamentTeamId,
	bracketIdx,
}: {
	tournamentTeamId: number;
	bracketIdx: number | null;
}) {
	return db.transaction().execute(async (trx) => {
		let query = trx
			.deleteFrom("TournamentTeamCheckIn")
			.where("TournamentTeamCheckIn.tournamentTeamId", "=", tournamentTeamId);

		if (typeof bracketIdx === "number") {
			query = query.where("TournamentTeamCheckIn.bracketIdx", "=", bracketIdx);
		}

		await query.execute();

		if (typeof bracketIdx === "number") {
			await trx
				.insertInto("TournamentTeamCheckIn")
				.values({
					checkedInAt: dateToDatabaseTimestamp(new Date()),
					tournamentTeamId,
					bracketIdx,
					isCheckOut: 1,
				})
				.execute();
		}
	});
}

export function updateName({
	tournamentTeamId,
	name,
}: {
	tournamentTeamId: number;
	name: string;
}) {
	return db
		.updateTable("TournamentTeam")
		.set({
			name,
		})
		.where("id", "=", tournamentTeamId)
		.execute();
}

export function dropOut({
	tournamentTeamId,
	previewBracketIdxs,
}: {
	tournamentTeamId: number;
	previewBracketIdxs: number[];
}) {
	return db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("TournamentTeamCheckIn")
			.where("tournamentTeamId", "=", tournamentTeamId)
			.where("TournamentTeamCheckIn.bracketIdx", "in", previewBracketIdxs)
			.execute();

		await trx
			.updateTable("TournamentTeam")
			.set({
				droppedOut: 1,
			})
			.where("id", "=", tournamentTeamId)
			.execute();
	});
}

export function undoDropOut(tournamentTeamId: number) {
	return db
		.updateTable("TournamentTeam")
		.set({
			droppedOut: 0,
		})
		.where("id", "=", tournamentTeamId)
		.execute();
}

export function join({
	previousTeamId,
	whatToDoWithPreviousTeam,
	newTeamId,
	userId,
	checkOutTeam = false,
}: {
	previousTeamId?: number;
	whatToDoWithPreviousTeam?: "LEAVE" | "DELETE";
	newTeamId: number;
	userId: number;
	checkOutTeam?: boolean;
}) {
	return db.transaction().execute(async (trx) => {
		if (whatToDoWithPreviousTeam === "DELETE") {
			await trx
				.deleteFrom("TournamentTeam")
				.where("TournamentTeam.id", "=", previousTeamId!)
				.execute();
		} else if (whatToDoWithPreviousTeam === "LEAVE") {
			await trx
				.deleteFrom("TournamentTeamMember")
				.where("TournamentTeamMember.tournamentTeamId", "=", previousTeamId!)
				.where("TournamentTeamMember.userId", "=", userId)
				.execute();
		}

		if (checkOutTeam) {
			invariant(
				previousTeamId,
				"previousTeamId is required when checking out team",
			);
			await trx
				.deleteFrom("TournamentTeamCheckIn")
				.where("TournamentTeamCheckIn.tournamentTeamId", "=", previousTeamId)
				.execute();
		}

		const tournamentId = (
			await trx
				.selectFrom("TournamentTeam")
				.select("TournamentTeam.tournamentId")
				.where("TournamentTeam.id", "=", newTeamId)
				.executeTakeFirstOrThrow()
		).tournamentId;

		const inGameName = await resolveInGameName(trx, tournamentId, userId);

		await trx
			.insertInto("TournamentTeamMember")
			.values({
				tournamentTeamId: newTeamId,
				userId,
				inGameName,
			})
			.execute();
	});
}

export function del(tournamentTeamId: number) {
	return db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("MapPoolMap")
			.where("MapPoolMap.tournamentTeamId", "=", tournamentTeamId)
			.execute();

		await trx
			.deleteFrom("TournamentTeam")
			.where("TournamentTeam.id", "=", tournamentTeamId)
			.execute();
	});
}

export function leave({ teamId, userId }: { teamId: number; userId: number }) {
	return db
		.deleteFrom("TournamentTeamMember")
		.where("TournamentTeamMember.tournamentTeamId", "=", teamId)
		.where("TournamentTeamMember.userId", "=", userId)
		.execute();
}

export function transferOwnership(
	tournamentTeamId: number,
	{
		oldCaptainId,
		newCaptainId,
	}: { oldCaptainId: number; newCaptainId: number },
) {
	return db.transaction().execute(async (trx) => {
		await trx
			.updateTable("TournamentTeamMember")
			.set({ role: "REGULAR" })
			.where("TournamentTeamMember.tournamentTeamId", "=", tournamentTeamId)
			.where("TournamentTeamMember.userId", "=", oldCaptainId)
			.execute();

		await trx
			.updateTable("TournamentTeamMember")
			.set({ role: "OWNER" })
			.where("TournamentTeamMember.tournamentTeamId", "=", tournamentTeamId)
			.where("TournamentTeamMember.userId", "=", newCaptainId)
			.execute();
	});
}

export function upsertCounterpickMaps({
	tournamentTeamId,
	mapPool,
}: {
	tournamentTeamId: Tables["TournamentTeam"]["id"];
	mapPool: MapPool;
}) {
	return db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("MapPoolMap")
			.where("MapPoolMap.tournamentTeamId", "=", tournamentTeamId)
			.execute();

		if (mapPool.stageModePairs.length > 0) {
			await trx
				.insertInto("MapPoolMap")
				.values(
					mapPool.stageModePairs.map(({ stageId, mode }) => ({
						tournamentTeamId,
						stageId,
						mode,
					})),
				)
				.execute();
		}
	});
}

async function findTeamRecentMaps(teamId: number, limit: number) {
	return db
		.selectFrom("TournamentMatchGameResult")
		.innerJoin(
			"TournamentMatchGameResultParticipant",
			"TournamentMatchGameResultParticipant.matchGameResultId",
			"TournamentMatchGameResult.id",
		)
		.select([
			"TournamentMatchGameResult.mode",
			"TournamentMatchGameResult.stageId",
		])
		.where("TournamentMatchGameResultParticipant.tournamentTeamId", "=", teamId)
		.orderBy("TournamentMatchGameResult.createdAt", "desc")
		.limit(limit)
		.execute();
}

export function findByInviteCode(inviteCode: string) {
	return db
		.selectFrom("TournamentTeam")
		.select(["TournamentTeam.id", "TournamentTeam.tournamentId"])
		.where("TournamentTeam.inviteCode", "=", inviteCode)
		.executeTakeFirst();
}

export async function findRecentlyPlayedMapsByIds({
	teamIds,
	limit = 5,
}: {
	/** Team IDs to retrieve recent maps for */
	teamIds: [number, number];
	/** Limit of recent maps to retrieve per team
	 *
	 * @default 5
	 */
	limit?: number;
}): Promise<Array<{ mode: ModeShort; stageId: StageId }>> {
	const [teamOneMaps, teamTwoMaps] = await Promise.all([
		findTeamRecentMaps(teamIds[0], limit),
		findTeamRecentMaps(teamIds[1], limit),
	]);

	return flatZip(teamOneMaps, teamTwoMaps);
}

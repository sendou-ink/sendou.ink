// TODO: add rest of the functions here that relate more to tournament teams than tournament/bracket

import type { Transaction } from "kysely";
import { sql } from "kysely";
import { nanoid } from "nanoid";
import { INVITE_CODE_LENGTH } from "~/constants";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import { databaseTimestampNow } from "~/utils/dates";
import invariant from "~/utils/invariant";

export function setActiveRoster({
	teamId,
	activeRosterUserIds,
}: {
	teamId: number;
	activeRosterUserIds: number[];
}) {
	return db
		.updateTable("TournamentTeam")
		.set({ activeRosterUserIds: JSON.stringify(activeRosterUserIds) })
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
	ownerInGameName,
}: {
	team: Pick<
		Tables["TournamentTeam"],
		"name" | "prefersNotToHost" | "noScreen" | "teamId"
	>;
	avatarFileName?: string;
	userId: number;
	tournamentId: number;
	ownerInGameName: string | null;
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
				inviteCode: nanoid(INVITE_CODE_LENGTH),
				prefersNotToHost: team.prefersNotToHost,
				noScreen: team.noScreen,
				teamId: team.teamId,
				avatarImgId,
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("TournamentTeamMember")
			.values({
				tournamentTeamId: tournamentTeam.id,
				userId,
				isOwner: 1,
				inGameName: ownerInGameName,
			})
			.execute();
	});
}

export function copyFromAnotherTournament({
	tournamentTeamId,
	destinationTournamentId,
}: { tournamentTeamId: number; destinationTournamentId: number }) {
	return db.transaction().execute(async (trx) => {
		const oldTeam = await trx
			.selectFrom("TournamentTeam")
			.select([
				"TournamentTeam.avatarImgId",
				"TournamentTeam.createdAt",
				"TournamentTeam.name",
				"TournamentTeam.noScreen",
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
				"TournamentTeamMember.isOwner",
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
				inviteCode: nanoid(INVITE_CODE_LENGTH),
			})
			.returning("id")
			.executeTakeFirstOrThrow();

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
		"id" | "name" | "prefersNotToHost" | "noScreen" | "teamId"
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
			: // don't overwrite the existing avatarImgId even if no new avatar is provided
				// delete is a separate functionality
				undefined;

		await trx
			.updateTable("TournamentTeam")
			.set({
				name: team.name,
				prefersNotToHost: team.prefersNotToHost,
				noScreen: team.noScreen,
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

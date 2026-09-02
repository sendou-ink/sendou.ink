import type { NotNull, Transaction } from "kysely";
import { sql } from "kysely";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import * as ChatRepository from "~/features/chat/ChatRepository.server";
import type { MapPool } from "~/features/map-list-generator/core/map-pool";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { flatZip } from "~/utils/arrays";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import invariant from "~/utils/invariant";
import {
	jsonArrayFrom,
	tournamentLogoWithDefault,
} from "~/utils/kysely.server";
import { toDBBoolean } from "~/utils/sql";
import * as TournamentAuditLogRepository from "./TournamentAuditLogRepository.server";

/** Teams owning the given chat rooms, with their members' user ids and the tournament they belong to. */
export async function findAllByChatRoomIds(chatRoomIds: number[]) {
	if (chatRoomIds.length === 0) return [];

	return db
		.selectFrom("TournamentTeam")
		.innerJoin(
			"CalendarEvent",
			"CalendarEvent.tournamentId",
			"TournamentTeam.tournamentId",
		)
		.select((eb) => [
			"TournamentTeam.chatRoomId",
			"TournamentTeam.name",
			"TournamentTeam.tournamentId",
			"CalendarEvent.name as tournamentName",
			tournamentLogoWithDefault(eb).as("logoUrl"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentTeamMember")
					.select("TournamentTeamMember.userId")
					.whereRef(
						"TournamentTeamMember.tournamentTeamId",
						"=",
						"TournamentTeam.id",
					),
			).as("members"),
		])
		.where("TournamentTeam.chatRoomId", "in", chatRoomIds)
		.$narrowType<{ chatRoomId: NotNull }>()
		.execute();
}

/** Members of the given teams, one row per member. */
export async function findAllMembersByTeamIds(tournamentTeamIds: number[]) {
	if (tournamentTeamIds.length === 0) return [];

	return db
		.selectFrom("TournamentTeamMember")
		.select([
			"TournamentTeamMember.tournamentTeamId",
			"TournamentTeamMember.userId",
		])
		.where("TournamentTeamMember.tournamentTeamId", "in", tournamentTeamIds)
		.execute();
}

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
      "CalendarEventDate"."startsAt"
    )`,
			">",
			databaseTimestampNow(),
		)
		.execute();

export function updateMemberInGameName({
	userId,
	inGameName,
	tournamentTeamId,
}: {
	userId: number;
	inGameName: string;
	tournamentTeamId: number;
}) {
	return db.transaction().execute(async (trx) => {
		await trx
			.updateTable("TournamentTeamMember")
			.set({ inGameName })
			.where("TournamentTeamMember.userId", "=", userId)
			.where("TournamentTeamMember.tournamentTeamId", "=", tournamentTeamId)
			.execute();

		await TournamentAuditLogRepository.insert(
			{
				type: "UPDATE_IN_GAME_NAME",
				tournamentTeamId,
				subjectUserId: userId,
				metadata: { inGameName },
			},
			trx,
		);
	});
}

/** Updates the acting user's in-game name in tournaments not yet started, returning the ids of those tournaments. */
export async function updateOwnMemberInGameNameForNonStarted(
	inGameName: string,
): Promise<number[]> {
	const userId = actorId();
	const tournamentTeams = await regOpenTournamentTeamsByJoinedUserId(userId);

	await db
		.updateTable("TournamentTeamMember")
		.set({ inGameName })
		.where("TournamentTeamMember.userId", "=", userId)
		// IGN can't be updated from here after check-in
		.where(
			"TournamentTeamMember.tournamentTeamId",
			"in",
			tournamentTeams.map((t) => t.tournamentTeamId),
		)
		// null when the tournament doesn't require IGN
		.where("TournamentTeamMember.inGameName", "is not", null)
		.execute();

	return tournamentTeams.map((t) => t.tournamentId);
}

export function insert({
	team,
	avatarImgId = null,
	userId,
	additionalMemberUserIds = [],
	tournamentId,
}: {
	team: Pick<Tables["TournamentTeam"], "name" | "prefersNotToHost" | "teamId">;
	avatarImgId?: number | null;
	/** The user who becomes the team owner. */
	userId: number;
	/** Non-owner members to add to the team on creation. */
	additionalMemberUserIds?: number[];
	tournamentId: number;
}) {
	return db.transaction().execute(async (trx) => {
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

		const isSub = (await registrationClosedNow(trx, tournamentId)) ? 1 : 0;

		const inGameName = await resolveInGameName({ tournamentId, userId }, trx);

		await trx
			.insertInto("TournamentTeamMember")
			.values({
				tournamentTeamId: tournamentTeam.id,
				userId,
				role: "OWNER",
				inGameName,
				isSub,
			})
			.execute();

		await TournamentAuditLogRepository.insert(
			{
				type: "TEAM_REGISTERED",
				tournamentTeamId: tournamentTeam.id,
				subjectUserId: userId,
			},
			trx,
		);

		if (additionalMemberUserIds.length > 0) {
			const members: Array<
				Pick<
					Tables["TournamentTeamMember"],
					"tournamentTeamId" | "userId" | "inGameName" | "isSub"
				>
			> = [];
			for (const memberUserId of additionalMemberUserIds) {
				members.push({
					tournamentTeamId: tournamentTeam.id,
					userId: memberUserId,
					inGameName: await resolveInGameName(
						{ tournamentId, userId: memberUserId },
						trx,
					),
					isSub,
				});
			}

			await trx.insertInto("TournamentTeamMember").values(members).execute();

			for (const memberUserId of additionalMemberUserIds) {
				await TournamentAuditLogRepository.insert(
					{
						type: "MEMBER_ADDED",
						tournamentTeamId: tournamentTeam.id,
						subjectUserId: memberUserId,
					},
					trx,
				);
			}
		}

		return tournamentTeam;
	});
}

/**
 * Creates a registration or applies a full-state edit to an existing one (`tournamentTeamId`)
 * in one transaction: name, linked team, owner, members, in-game names, tournament names and
 * counterpick map pool. The caller validates the ops and handles side effects (caches,
 * notifications). Returns the tournament name changes actually applied (values equal to the
 * current one are no-ops), for the caller to log.
 */
export function upsertRegistration({
	tournamentTeamId,
	tournamentId,
	name,
	teamId,
	avatarImgId,
	ownerUserId,
	ownerChange,
	membersToAdd,
	membersToRemove,
	inGameNameUpdates,
	tournamentNameUpdates,
	mapPool,
}: {
	/** Present when editing an existing team, omitted when creating a new one. */
	tournamentTeamId?: number;
	tournamentId: number;
	name: string;
	/** Linked sendou.ink team id, or null for a pickup team. */
	teamId: number | null;
	/** Resolved pickup team logo image id (null for none / linked teams). */
	avatarImgId: number | null;
	/** Roster owner/captain. Assigned the OWNER role when creating a new team. */
	ownerUserId: number;
	/** Owner transfer for an existing team (null when unchanged or when creating). */
	ownerChange: { oldOwnerId: number; newOwnerId: number } | null;
	membersToAdd: number[];
	membersToRemove: number[];
	inGameNameUpdates: Array<{ userId: number; inGameName: string }>;
	/** Organizer-set names shown in every tournament. `null` clears the user's current one. */
	tournamentNameUpdates: Array<{
		userId: number;
		tournamentName: string | null;
	}>;
	/** Counterpick map pool to replace the team's with. Omitted leaves it as is. */
	mapPool?: MapPool;
}) {
	const isNew = typeof tournamentTeamId !== "number";

	return db.transaction().execute(async (trx) => {
		const id = isNew
			? (
					await trx
						.insertInto("TournamentTeam")
						.values({
							tournamentId,
							name,
							inviteCode: shortNanoid(),
							prefersNotToHost: 0,
							teamId,
							avatarImgId,
						})
						.returning("id")
						.executeTakeFirstOrThrow()
				).id
			: tournamentTeamId;

		if (!isNew) {
			const { activeRosterUserIds } = await trx
				.selectFrom("TournamentTeam")
				.select("TournamentTeam.activeRosterUserIds")
				.where("TournamentTeam.id", "=", id)
				.executeTakeFirstOrThrow();
			const clearActiveRoster = (activeRosterUserIds ?? []).some((memberId) =>
				membersToRemove.includes(memberId),
			);

			await trx
				.updateTable("TournamentTeam")
				.set({
					name,
					teamId,
					avatarImgId,
					...(clearActiveRoster ? { activeRosterUserIds: null } : {}),
				})
				.where("TournamentTeam.id", "=", id)
				.execute();

			await TournamentAuditLogRepository.updateTeamHistoryName(trx, {
				tournamentTeamId: id,
				name,
			});
		}

		if (mapPool) {
			await replaceCounterpickMaps(trx, { tournamentTeamId: id, mapPool });
		}

		for (const userId of membersToRemove) {
			await TournamentAuditLogRepository.insert(
				{
					type: "MEMBER_REMOVED",
					tournamentTeamId: id,
					subjectUserId: userId,
				},
				trx,
			);

			await trx
				.deleteFrom("TournamentTeamMember")
				.where("TournamentTeamMember.tournamentTeamId", "=", id)
				.where("TournamentTeamMember.userId", "=", userId)
				.execute();
		}

		const isSub =
			membersToAdd.length > 0 &&
			(await registrationClosedNow(trx, tournamentId))
				? 1
				: 0;

		if (membersToAdd.length > 0) {
			const members: Array<
				Pick<
					Tables["TournamentTeamMember"],
					| "tournamentTeamId"
					| "userId"
					| "inGameName"
					| "isSub"
					| "role"
					| "isOrganizerAdded"
				>
			> = [];
			for (const userId of membersToAdd) {
				const isOwner = isNew && userId === ownerUserId;
				members.push({
					tournamentTeamId: id,
					userId,
					inGameName:
						inGameNameUpdates.find((member) => member.userId === userId)
							?.inGameName ??
						(await resolveInGameName({ tournamentId, userId }, trx)),
					isSub,
					// every row needs the same keys, otherwise Kysely inserts null for the missing ones
					role: isOwner ? "OWNER" : "REGULAR",
					isOrganizerAdded: 1,
				});
			}

			await trx.insertInto("TournamentTeamMember").values(members).execute();

			for (const userId of membersToAdd) {
				await TournamentAuditLogRepository.insert(
					{
						type:
							isNew && userId === ownerUserId
								? "TEAM_REGISTERED"
								: "MEMBER_ADDED",
						tournamentTeamId: id,
						subjectUserId: userId,
					},
					trx,
				);
			}
		}

		// after adds so a newly added member can be designated owner
		if (ownerChange) {
			await trx
				.updateTable("TournamentTeamMember")
				.set({ role: "REGULAR" })
				.where("TournamentTeamMember.tournamentTeamId", "=", id)
				.where("TournamentTeamMember.userId", "=", ownerChange.oldOwnerId)
				.execute();

			await trx
				.updateTable("TournamentTeamMember")
				.set({ role: "OWNER" })
				.where("TournamentTeamMember.tournamentTeamId", "=", id)
				.where("TournamentTeamMember.userId", "=", ownerChange.newOwnerId)
				.execute();
		}

		for (const { userId, inGameName } of inGameNameUpdates) {
			await trx
				.updateTable("TournamentTeamMember")
				.set({ inGameName })
				.where("TournamentTeamMember.tournamentTeamId", "=", id)
				.where("TournamentTeamMember.userId", "=", userId)
				.execute();

			await TournamentAuditLogRepository.insert(
				{
					type: "UPDATE_IN_GAME_NAME",
					tournamentTeamId: id,
					subjectUserId: userId,
					metadata: { inGameName },
				},
				trx,
			);
		}

		const appliedTournamentNameChanges: Array<{
			userId: number;
			previousTournamentName: string | null;
			tournamentName: string | null;
		}> = [];
		for (const { userId, tournamentName } of tournamentNameUpdates) {
			const { tournamentName: previousTournamentName } = await trx
				.selectFrom("User")
				.select("User.tournamentName")
				.where("User.id", "=", userId)
				.executeTakeFirstOrThrow();

			if (previousTournamentName === tournamentName) continue;

			await trx
				.updateTable("User")
				.set({ tournamentName })
				.where("User.id", "=", userId)
				.execute();

			await TournamentAuditLogRepository.insert(
				{
					type: "UPDATE_TOURNAMENT_NAME",
					tournamentTeamId: id,
					subjectUserId: userId,
					metadata: { tournamentName },
				},
				trx,
			);

			appliedTournamentNameChanges.push({
				userId,
				previousTournamentName,
				tournamentName,
			});
		}

		return { appliedTournamentNameChanges };
	});
}

/** Registration is closed after `regClosesAt`, or the start time without it. Members added after that are subs. */
async function registrationClosedNow(
	trx: Transaction<DB>,
	tournamentId: number,
) {
	const { regClosesAt } = await trx
		.selectFrom("Tournament")
		.innerJoin("CalendarEvent", "CalendarEvent.tournamentId", "Tournament.id")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEventDate.eventId",
			"CalendarEvent.id",
		)
		.select(
			sql<number>`coalesce(
				"Tournament"."settings" ->> 'regClosesAt',
				min("CalendarEventDate"."startsAt")
			)`.as("regClosesAt"),
		)
		.where("Tournament.id", "=", tournamentId)
		.executeTakeFirstOrThrow();

	return regClosesAt <= databaseTimestampNow();
}

async function resolveInGameName(
	{ tournamentId, userId }: { tournamentId: number; userId: number },
	trx: Transaction<DB>,
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

	invariant(user.inGameName, "In-game name is required but not set");

	return user.inGameName;
}

export function update({
	team,
	avatarImgId,
}: {
	team: Pick<
		Tables["TournamentTeam"],
		"id" | "name" | "prefersNotToHost" | "teamId"
	>;
	/** Resolved logo image id. `null` clears the pickup avatar (e.g. when switching to a linked team). */
	avatarImgId: number | null;
}) {
	return db.transaction().execute(async (trx) => {
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

		await TournamentAuditLogRepository.updateTeamHistoryName(trx, {
			tournamentTeamId: team.id,
			name: team.name,
		});
	});
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

export function updateAbDivisions(
	abDivisions: {
		tournamentTeamId: number;
		abDivision: 0 | 1 | null;
	}[],
) {
	const grouped = Object.groupBy(abDivisions, (ab) => String(ab.abDivision));

	return db.transaction().execute(async (trx) => {
		for (const [abDivisionKey, tournamentTeams = []] of Object.entries(
			grouped,
		)) {
			if (tournamentTeams.length === 0) continue;

			await trx
				.updateTable("TournamentTeam")
				.set({
					abDivision: abDivisionKey === "null" ? null : Number(abDivisionKey),
				})
				.where(
					"TournamentTeam.id",
					"in",
					tournamentTeams.map((t) => t.tournamentTeamId),
				)
				.execute();
		}
	});
}

/** Checks a team in to the whole tournament, or to one bracket with `bracketIdx`. Clears existing check-outs first. */
export function checkIn(
	tournamentTeamId: number,
	options?: { bracketIdx?: number },
) {
	const bracketIdx = options?.bracketIdx ?? null;

	return db.transaction().execute(async (trx) => {
		let query = trx
			.deleteFrom("TournamentTeamCheckIn")
			.where("TournamentTeamCheckIn.tournamentTeamId", "=", tournamentTeamId);

		if (typeof bracketIdx === "number") {
			query = query.where("TournamentTeamCheckIn.bracketIdx", "=", bracketIdx);
		} else {
			query = query.where((eb) =>
				eb.or([
					eb("TournamentTeamCheckIn.isCheckOut", "=", 1),
					eb("TournamentTeamCheckIn.bracketIdx", "is", null),
				]),
			);
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

		await TournamentAuditLogRepository.insert(
			{
				type: "TEAM_CHECKED_IN",
				tournamentTeamId,
				metadata: typeof bracketIdx === "number" ? { bracketIdx } : null,
			},
			trx,
		);
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

		await TournamentAuditLogRepository.insert(
			{
				type: "TEAM_CHECKED_OUT",
				tournamentTeamId,
				metadata: typeof bracketIdx === "number" ? { bracketIdx } : null,
			},
			trx,
		);
	});
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

		await TournamentAuditLogRepository.insert(
			{
				type: "TEAM_DROPPED_OUT",
				tournamentTeamId,
			},
			trx,
		);
	});
}

export function undoDropOut(tournamentTeamId: number) {
	return db.transaction().execute(async (trx) => {
		await trx
			.updateTable("TournamentTeam")
			.set({
				droppedOut: 0,
			})
			.where("id", "=", tournamentTeamId)
			.execute();

		await TournamentAuditLogRepository.insert(
			{
				type: "TEAM_DROP_OUT_UNDONE",
				tournamentTeamId,
			},
			trx,
		);
	});
}

/** @returns user ids whose chat room set changed, for `notifyRoomsChanged`. */
export function join({
	previousTeamIdToDelete,
	newTeamId,
	userId,
	isOrganizerAdded = false,
}: {
	/** Team to delete as the user joins, e.g. a solo team they leave behind. */
	previousTeamIdToDelete?: number;
	newTeamId: number;
	userId: number;
	/** Added by the organizer rather than joining on their own. */
	isOrganizerAdded?: boolean;
}): Promise<number[]> {
	return db.transaction().execute(async (trx) => {
		const roomsChangedUserIds: number[] = [];

		if (previousTeamIdToDelete) {
			await TournamentAuditLogRepository.insert(
				{
					type: "TEAM_UNREGISTERED",
					tournamentTeamId: previousTeamIdToDelete,
				},
				trx,
			);
			roomsChangedUserIds.push(
				...(await deleteTeamChatRoom(previousTeamIdToDelete, trx)),
			);
			await trx
				.deleteFrom("TournamentTeam")
				.where("TournamentTeam.id", "=", previousTeamIdToDelete)
				.execute();
		}

		const newTeam = await trx
			.selectFrom("TournamentTeam")
			.select(["TournamentTeam.tournamentId", "TournamentTeam.chatRoomId"])
			.where("TournamentTeam.id", "=", newTeamId)
			.executeTakeFirstOrThrow();
		const tournamentId = newTeam.tournamentId;

		if (newTeam.chatRoomId !== null) {
			roomsChangedUserIds.push(userId);
		}

		const inGameName = await resolveInGameName({ tournamentId, userId }, trx);
		const isSub = (await registrationClosedNow(trx, tournamentId)) ? 1 : 0;

		await trx
			.insertInto("TournamentTeamMember")
			.values({
				tournamentTeamId: newTeamId,
				userId,
				inGameName,
				isSub,
				isOrganizerAdded: toDBBoolean(isOrganizerAdded),
			})
			.execute();

		await TournamentAuditLogRepository.insert(
			{
				type: "MEMBER_ADDED",
				tournamentTeamId: newTeamId,
				subjectUserId: userId,
			},
			trx,
		);

		return roomsChangedUserIds;
	});
}

/** @returns user ids whose chat room set changed, for `notifyRoomsChanged`. */
export function deleteById(tournamentTeamId: number): Promise<number[]> {
	return db.transaction().execute(async (trx) => {
		await TournamentAuditLogRepository.insert(
			{
				type: "TEAM_UNREGISTERED",
				tournamentTeamId,
			},
			trx,
		);

		await trx
			.deleteFrom("MapPoolMap")
			.where("MapPoolMap.tournamentTeamId", "=", tournamentTeamId)
			.execute();

		const roomsChangedUserIds = await deleteTeamChatRoom(tournamentTeamId, trx);

		await trx
			.deleteFrom("TournamentTeam")
			.where("TournamentTeam.id", "=", tournamentTeamId)
			.execute();

		return roomsChangedUserIds;
	});
}

/** Whether the organizer added the user to the team rather than the user joining on their own. */
export async function isOrganizerAddedMember({
	tournamentTeamId,
	userId,
}: {
	tournamentTeamId: number;
	userId: number;
}) {
	const member = await db
		.selectFrom("TournamentTeamMember")
		.select("TournamentTeamMember.isOrganizerAdded")
		.where("TournamentTeamMember.tournamentTeamId", "=", tournamentTeamId)
		.where("TournamentTeamMember.userId", "=", userId)
		.executeTakeFirst();

	return Boolean(member?.isOrganizerAdded);
}

export function leave({ teamId, userId }: { teamId: number; userId: number }) {
	return db.transaction().execute(async (trx) => {
		await TournamentAuditLogRepository.insert(
			{
				type: "MEMBER_REMOVED",
				tournamentTeamId: teamId,
				subjectUserId: userId,
			},
			trx,
		);

		await trx
			.deleteFrom("TournamentTeamMember")
			.where("TournamentTeamMember.tournamentTeamId", "=", teamId)
			.where("TournamentTeamMember.userId", "=", userId)
			.execute();
	});
}

export function upsertCounterpickMaps(args: {
	tournamentTeamId: Tables["TournamentTeam"]["id"];
	mapPool: MapPool;
}) {
	return db.transaction().execute((trx) => replaceCounterpickMaps(trx, args));
}

async function replaceCounterpickMaps(
	trx: Transaction<DB>,
	{
		tournamentTeamId,
		mapPool,
	}: {
		tournamentTeamId: Tables["TournamentTeam"]["id"];
		mapPool: MapPool;
	},
) {
	await trx
		.deleteFrom("MapPoolMap")
		.where("MapPoolMap.tournamentTeamId", "=", tournamentTeamId)
		.execute();

	if (mapPool.stageModePairs.length === 0) return;

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

async function findTeamRecentMaps(
	teamId: number,
	excludeMatchId: number,
	limit: number,
) {
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
		.where("TournamentMatchGameResult.matchId", "!=", excludeMatchId)
		.orderBy("TournamentMatchGameResult.createdAt", "desc")
		.limit(limit)
		.execute();
}

/**
 * Registrations of the given users starting within the window, one row per member per event
 * date; dropped-out teams and hidden events excluded. Rows also carry what estimating the
 * tournament's duration needs (settings, registered team count) for availability commitments.
 * `excludeTournamentId` leaves one tournament out, for "busy elsewhere" views of that tournament.
 */
export function findAllRegistrationsByUserIds({
	userIds,
	startsAt,
	endsAt,
	excludeTournamentId,
}: {
	userIds: Array<number>;
	startsAt: number;
	endsAt: number;
	excludeTournamentId?: number;
}) {
	if (userIds.length === 0) return Promise.resolve([]);

	return db
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
		.select((eb) => [
			"TournamentTeamMember.userId",
			"CalendarEvent.name",
			"CalendarEvent.organizationId",
			"CalendarEventDate.startsAt",
			"Tournament.settings",
			eb
				.selectFrom("TournamentTeam as RegisteredTeam")
				.select(({ fn }) => fn.countAll<number>().as("count"))
				.whereRef("RegisteredTeam.tournamentId", "=", "Tournament.id")
				.where("RegisteredTeam.isPlaceholder", "=", 0)
				.as("teamCount"),
		])
		.$narrowType<{ teamCount: NotNull }>()
		.where("TournamentTeamMember.userId", "in", userIds)
		.where("TournamentTeam.droppedOut", "=", 0)
		.where("CalendarEvent.hidden", "=", 0)
		.where("CalendarEventDate.startsAt", ">=", startsAt)
		.where("CalendarEventDate.startsAt", "<=", endsAt)
		.$if(typeof excludeTournamentId === "number", (qb) =>
			qb.where("Tournament.id", "!=", excludeTournamentId!),
		)
		.execute();
}

/** Invite code of one team, the secret the tournament layout data does not carry. */
export async function findInviteCodeById(tournamentTeamId: number) {
	const row = await db
		.selectFrom("TournamentTeam")
		.select("TournamentTeam.inviteCode")
		.where("TournamentTeam.id", "=", tournamentTeamId)
		.executeTakeFirst();

	return row?.inviteCode ?? null;
}

export function findByInviteCode(inviteCode: string) {
	return db
		.selectFrom("TournamentTeam")
		.select(["TournamentTeam.id", "TournamentTeam.tournamentId"])
		.where("TournamentTeam.inviteCode", "=", inviteCode)
		.executeTakeFirst();
}

/** Map pools of the given tournament teams, keyed by tournament team id. */
export async function findMapPoolsByTeamIds(tournamentTeamIds: number[]) {
	const rows = await db
		.selectFrom("MapPoolMap")
		.select([
			"MapPoolMap.tournamentTeamId",
			"MapPoolMap.stageId",
			"MapPoolMap.mode",
		])
		.where("MapPoolMap.tournamentTeamId", "in", tournamentTeamIds)
		.$narrowType<{ tournamentTeamId: NotNull }>()
		.execute();

	const result = new Map<
		number,
		Array<{ mode: ModeShort; stageId: StageId }>
	>();
	for (const row of rows) {
		const existing = result.get(row.tournamentTeamId);
		if (existing) {
			existing.push({ mode: row.mode, stageId: row.stageId });
		} else {
			result.set(row.tournamentTeamId, [
				{ mode: row.mode, stageId: row.stageId },
			]);
		}
	}

	return result;
}

export async function findRecentlyPlayedMapsByIds({
	teamIds,
	excludeMatchId,
	limit = 5,
}: {
	teamIds: [number, number];
	/** The match the maps are resolved for, left out so its own played games don't change the map list mid-set. */
	excludeMatchId: number;
	/** Recent maps per team, default 5. */
	limit?: number;
}): Promise<Array<{ mode: ModeShort; stageId: StageId }>> {
	const [teamOneMaps, teamTwoMaps] = await Promise.all([
		findTeamRecentMaps(teamIds[0], excludeMatchId, limit),
		findTeamRecentMaps(teamIds[1], excludeMatchId, limit),
	]);

	return flatZip(teamOneMaps, teamTwoMaps);
}

/** @returns the members who lost the room, empty when the team had none. */
async function deleteTeamChatRoom(
	tournamentTeamId: number,
	trx: Transaction<DB>,
): Promise<number[]> {
	const team = await trx
		.selectFrom("TournamentTeam")
		.select("TournamentTeam.chatRoomId")
		.where("TournamentTeam.id", "=", tournamentTeamId)
		.executeTakeFirst();

	if (!team?.chatRoomId) return [];

	const members = await trx
		.selectFrom("TournamentTeamMember")
		.select("TournamentTeamMember.userId")
		.where("TournamentTeamMember.tournamentTeamId", "=", tournamentTeamId)
		.execute();

	await ChatRepository.deleteRoomsByIds([team.chatRoomId], trx);

	return members.map((member) => member.userId);
}

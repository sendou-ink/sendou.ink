import type { Transaction } from "kysely";
import { sql } from "kysely";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import type { MapPool } from "~/features/map-list-generator/core/map-pool";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { flatZip } from "~/utils/arrays";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import invariant from "~/utils/invariant";
import * as TournamentAuditLogRepository from "./TournamentAuditLogRepository.server";

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

		await TournamentAuditLogRepository.insert(trx, {
			type: "UPDATE_IN_GAME_NAME",
			tournamentTeamId,
			subjectUserId: userId,
			metadata: { inGameName },
		});
	});
}

/**
 * Updates the in-game name of a tournament team member for tournaments that have not started yet.
 *
 * @returns A promise that resolves to an array of tournament IDs where the user's in-game name was updated.
 */
export async function updateOwnMemberInGameNameForNonStarted(
	/** The new in-game name to be set for the acting user. */
	inGameName: string,
): Promise<number[]> {
	const userId = actorId();
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

		await TournamentAuditLogRepository.insert(trx, {
			type: "TEAM_REGISTERED",
			tournamentTeamId: tournamentTeam.id,
			subjectUserId: userId,
		});

		for (const memberUserId of additionalMemberUserIds) {
			const memberInGameName = await resolveInGameName(
				trx,
				tournamentId,
				memberUserId,
			);

			await trx
				.insertInto("TournamentTeamMember")
				.values({
					tournamentTeamId: tournamentTeam.id,
					userId: memberUserId,
					inGameName: memberInGameName,
				})
				.execute();

			await TournamentAuditLogRepository.insert(trx, {
				type: "MEMBER_ADDED",
				tournamentTeamId: tournamentTeam.id,
				subjectUserId: memberUserId,
			});
		}

		return tournamentTeam;
	});
}

/**
 * Creates a new registration or applies a full-state edit to an existing one in a
 * single transaction: team name, linked sendou.ink team, owner assignment/transfer,
 * member adds/removes and in-game name updates. Pass `tournamentTeamId` to edit an
 * existing team, or omit it to create a new one (all members are then "added" and
 * `ownerUserId` becomes the owner). The caller is responsible for validating the
 * derived ops and for any side effects (cache updates, notifications) outside the
 * transaction.
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

		for (const userId of membersToRemove) {
			await TournamentAuditLogRepository.insert(trx, {
				type: "MEMBER_REMOVED",
				tournamentTeamId: id,
				subjectUserId: userId,
			});

			await trx
				.deleteFrom("TournamentTeamMember")
				.where("TournamentTeamMember.tournamentTeamId", "=", id)
				.where("TournamentTeamMember.userId", "=", userId)
				.execute();
		}

		for (const userId of membersToAdd) {
			const isOwner = isNew && userId === ownerUserId;
			const inGameName = await resolveInGameName(trx, tournamentId, userId);

			await trx
				.insertInto("TournamentTeamMember")
				.values({
					tournamentTeamId: id,
					userId,
					inGameName,
					...(isOwner ? { role: "OWNER" as const } : {}),
				})
				.execute();

			await TournamentAuditLogRepository.insert(trx, {
				type: isOwner ? "TEAM_REGISTERED" : "MEMBER_ADDED",
				tournamentTeamId: id,
				subjectUserId: userId,
			});
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

			await TournamentAuditLogRepository.insert(trx, {
				type: "UPDATE_IN_GAME_NAME",
				tournamentTeamId: id,
				subjectUserId: userId,
				metadata: { inGameName },
			});
		}
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

	invariant(user.inGameName, "In-game name is required but not set");

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

/**
 * Checks in a tournament team. Clears any existing check-out records before inserting the check-in.
 * When called without `bracketIdx`, checks in for the whole tournament.
 * When called with `bracketIdx`, checks in for a specific bracket (e.g. after progression).
 */
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

		await TournamentAuditLogRepository.insert(trx, {
			type: "TEAM_CHECKED_IN",
			tournamentTeamId,
			metadata: typeof bracketIdx === "number" ? { bracketIdx } : null,
		});
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

		await TournamentAuditLogRepository.insert(trx, {
			type: "TEAM_CHECKED_OUT",
			tournamentTeamId,
			metadata: typeof bracketIdx === "number" ? { bracketIdx } : null,
		});
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

		await TournamentAuditLogRepository.insert(trx, {
			type: "TEAM_DROPPED_OUT",
			tournamentTeamId,
		});
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

		await TournamentAuditLogRepository.insert(trx, {
			type: "TEAM_DROP_OUT_UNDONE",
			tournamentTeamId,
		});
	});
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
	/** The user joining the team. */
	userId: number;
	checkOutTeam?: boolean;
}) {
	return db.transaction().execute(async (trx) => {
		if (whatToDoWithPreviousTeam === "DELETE") {
			await TournamentAuditLogRepository.insert(trx, {
				type: "TEAM_UNREGISTERED",
				tournamentTeamId: previousTeamId!,
			});
			await trx
				.deleteFrom("TournamentTeam")
				.where("TournamentTeam.id", "=", previousTeamId!)
				.execute();
		} else if (whatToDoWithPreviousTeam === "LEAVE") {
			await TournamentAuditLogRepository.insert(trx, {
				type: "MEMBER_REMOVED",
				tournamentTeamId: previousTeamId!,
				subjectUserId: userId,
			});
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

		await TournamentAuditLogRepository.insert(trx, {
			type: "MEMBER_ADDED",
			tournamentTeamId: newTeamId,
			subjectUserId: userId,
		});
	});
}

export function del(tournamentTeamId: number) {
	return db.transaction().execute(async (trx) => {
		await TournamentAuditLogRepository.insert(trx, {
			type: "TEAM_UNREGISTERED",
			tournamentTeamId,
		});

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

export function leave({
	teamId,
	userId,
}: {
	teamId: number;
	/** The member leaving the team. */
	userId: number;
}) {
	return db.transaction().execute(async (trx) => {
		await TournamentAuditLogRepository.insert(trx, {
			type: "MEMBER_REMOVED",
			tournamentTeamId: teamId,
			subjectUserId: userId,
		});

		await trx
			.deleteFrom("TournamentTeamMember")
			.where("TournamentTeamMember.tournamentTeamId", "=", teamId)
			.where("TournamentTeamMember.userId", "=", userId)
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

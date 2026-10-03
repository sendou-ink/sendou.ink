import type { ExpressionBuilder, NotNull, Transaction } from "kysely";
import { sql } from "kysely";
import { crud } from "~/db/crud";
import { defineQuery, type QueryRow, refine } from "~/db/entity-query";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import type { MapPool } from "~/features/map-list-generator/core/map-pool";
import { flatZip } from "~/utils/arrays";
import { databaseTimestampNow } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import { invariant } from "~/utils/invariant";
import {
	asBoolean,
	commonUserSelect,
	concatUserSubmittedImagePrefix,
	jsonArrayFrom,
	jsonObjectFrom,
} from "~/utils/kysely.server";
import * as TournamentAuditLogRepository from "./TournamentAuditLogRepository.server";

const teamTable = crud("TournamentTeam");
const memberTable = crud("TournamentTeamMember");
const checkInTable = crud("TournamentTeamCheckIn");
const mapPoolMapTable = crud("MapPoolMap");
const userTable = crud("User");

// the name is mirrored to the team's audit log history, dropping out is audit logged
export const { updateById } = teamTable.except("name", "droppedOut");
export const { findOneBy: findMemberBy } = memberTable;

// a team's members, subs included, nowhere near this
const MEMBERS_PER_TEAM_LIMIT = 100;

/**
 * Tournament teams in seed order, then in registration order. Placeholders, the groups of the
 * tournament's LFG stored as teams, are left out unless a step lifts the guard: `includingPlaceholders`.
 */
export const tournamentTeams = defineQuery({
	root: "TournamentTeam",
	select: (qb) =>
		qb.select([
			"TournamentTeam.id",
			"TournamentTeam.name",
			"TournamentTeam.seed",
			"TournamentTeam.prefersNotToHost",
			"TournamentTeam.droppedOut",
			"TournamentTeam.createdAt",
			"TournamentTeam.activeRosterUserIds",
			"TournamentTeam.startingBracketIdx",
			"TournamentTeam.abDivision",
		]),
	defaultSort: [
		["TournamentTeam.seed", "asc"],
		["TournamentTeam.createdAt", "asc"],
		["TournamentTeam.id", "asc"],
	],
	guards: {
		placeholder: (qb) => qb.where("TournamentTeam.isPlaceholder", "=", false),
	},
	vocabulary: ({ lift }) => ({
		/** The tournament LFG's groups too, for reads following a group (its chat room). */
		includingPlaceholders: () => lift("placeholder"),
		/** The pickup team's own logo, `pickupAvatarUrl`. Linked teams show the logo of the team instead. */
		withPickupAvatar: () =>
			refine("TournamentTeam", (qb) =>
				qb.select((eb) =>
					concatUserSubmittedImagePrefix(
						eb
							.selectFrom("UserSubmittedImage")
							.select("UserSubmittedImage.url")
							.whereRef(
								"UserSubmittedImage.id",
								"=",
								"TournamentTeam.avatarImgId",
							)
							.$asScalar(),
					).as("pickupAvatarUrl"),
				),
			),
		/** The sendou.ink team the registration is linked to with its logo, `null` for a pickup team. Deleted teams included. */
		withLinkedTeam: () =>
			refine("TournamentTeam", (qb) =>
				qb.select((eb) =>
					jsonObjectFrom(
						eb
							.selectFrom("Team")
							.leftJoin(
								"UserSubmittedImage",
								"Team.avatarImgId",
								"UserSubmittedImage.id",
							)
							.whereRef("Team.id", "=", "TournamentTeam.teamId")
							.select((teamEb) => [
								"Team.id",
								"Team.customUrl",
								concatUserSubmittedImagePrefix(
									teamEb.ref("UserSubmittedImage.url"),
								).as("logoUrl"),
								"Team.deletedAt",
							]),
					).as("team"),
				),
			),
		/** Members' user ids, roles and when they joined: owner first, then in join order. */
		withMembers: () =>
			refine("TournamentTeam", (qb) =>
				qb.select((eb) =>
					jsonArrayFrom(
						membersInRosterOrder(eb).select([
							"TournamentTeamMember.userId",
							"TournamentTeamMember.role",
							"TournamentTeamMember.createdAt",
						]),
					).as("members"),
				),
			),
		/** {@link withMembers} with what rosters show of each member: profile, in-game name, sub and organizer added flags. */
		withRoster: () =>
			refine("TournamentTeam", (qb) =>
				qb.select((eb) =>
					jsonArrayFrom(
						membersInRosterOrder(eb)
							.innerJoin("User", "TournamentTeamMember.userId", "User.id")
							.select((memberEb) => [
								...commonUserSelect(memberEb, {
									idAs: "userId",
									inTournament: true,
								}),
								"User.country",
								"User.tournamentName",
								"TournamentTeamMember.role",
								"TournamentTeamMember.createdAt",
								"TournamentTeamMember.isSub",
								"TournamentTeamMember.isOrganizerAdded",
								memberEb.fn
									.coalesce(
										"TournamentTeamMember.inGameName",
										"User.inGameName",
									)
									.as("inGameName"),
							]),
					).as("members"),
				),
			),
		/** Check-ins to the tournament (`bracketIdx` `null`) and to its brackets, plus check-outs from brackets. */
		withCheckIns: () =>
			refine("TournamentTeam", (qb) =>
				qb.select((eb) =>
					jsonArrayFrom(
						eb
							.selectFrom("TournamentTeamCheckIn")
							.select([
								"TournamentTeamCheckIn.bracketIdx",
								"TournamentTeamCheckIn.checkedInAt",
								"TournamentTeamCheckIn.isCheckOut",
							])
							.whereRef(
								"TournamentTeamCheckIn.tournamentTeamId",
								"=",
								"TournamentTeam.id",
							),
					).as("checkIns"),
				),
			),
		/** The counterpick maps the team picked. */
		withMapPool: () =>
			refine("TournamentTeam", (qb) =>
				qb.select((eb) =>
					jsonArrayFrom(
						eb
							.selectFrom("MapPoolMap")
							.select(["MapPoolMap.stageId", "MapPoolMap.mode"])
							.whereRef(
								"MapPoolMap.tournamentTeamId",
								"=",
								"TournamentTeam.id",
							),
					).as("mapPool"),
				),
			),
		withHasMapPool: () =>
			refine("TournamentTeam", (qb) =>
				qb.select((eb) =>
					asBoolean(
						eb.exists(
							eb
								.selectFrom("MapPoolMap")
								.select("MapPoolMap.stageId")
								.whereRef(
									"MapPoolMap.tournamentTeamId",
									"=",
									"TournamentTeam.id",
								),
						),
					).as("hasMapPool"),
				),
			),
		/**
		 * The members' average seeding skill ordinal of the type (ranked or unranked) the
		 * tournament uses, rounded to two decimals. `null` when no member has one.
		 */
		withAvgSeedingSkillOrdinal: () =>
			refine("TournamentTeam", (qb) =>
				qb.select((eb) =>
					// the type picked per team, inside the join it parsed the settings once per member
					eb
						.case()
						.when(isRankedTournamentOf(eb), "=", 1)
						.then(averageSeedingOrdinal(eb, "RANKED"))
						.else(averageSeedingOrdinal(eb, "UNRANKED"))
						.end()
						.as("avgSeedingSkillOrdinal"),
				),
			).mapRows(({ avgSeedingSkillOrdinal }) => ({
				avgSeedingSkillOrdinal:
					typeof avgSeedingSkillOrdinal === "number"
						? Math.round(avgSeedingSkillOrdinal * 100) / 100
						: null,
			})),
	}),
});

export type TeamWithRoster = QueryRow<ReturnType<typeof teamsWithRosters>>;

/**
 * The tournament's teams with their full rosters, check-ins, map pools and invite codes. The
 * tournament data's teams leave all of these out, views that render rosters load them separately.
 */
export function teamsWithRosters(tournamentId: number) {
	return tournamentTeams()
		.where({ tournamentId })
		.withColumns(["inviteCode", "avatarImgId"])
		.withPickupAvatar()
		.withLinkedTeam()
		.withRoster()
		.withCheckIns()
		.withMapPool()
		.withAvgSeedingSkillOrdinal();
}

/** The team the invite code lets a user join. */
export function teamByInviteCode(inviteCode: string) {
	return tournamentTeams().where({ inviteCode }).withColumns(["tournamentId"]);
}

/** Map pools of the given tournament teams, keyed by tournament team id. */
export async function findMapPoolsByTeamIds(tournamentTeamIds: number[]) {
	const teams = await tournamentTeams()
		.whereIdIn(tournamentTeamIds)
		.withMapPool()
		.execute();

	return new Map(teams.map((team) => [team.id, team.mapPool]));
}

/**
 * Twitch accounts of the given tournaments' participants who have not dropped out.
 * Only the live stream sync routine needs them.
 */
export async function findParticipantTwitchAccounts(tournamentIds: number[]) {
	if (tournamentIds.length === 0) return [];

	return db
		.selectFrom("TournamentTeamMember")
		.innerJoin(
			"TournamentTeam",
			"TournamentTeam.id",
			"TournamentTeamMember.tournamentTeamId",
		)
		.innerJoin("User", "User.id", "TournamentTeamMember.userId")
		.select([
			"TournamentTeam.tournamentId",
			"TournamentTeamMember.userId",
			"User.twitch",
		])
		.where("TournamentTeam.tournamentId", "in", tournamentIds)
		.where("TournamentTeam.isPlaceholder", "=", false)
		.where("TournamentTeam.droppedOut", "=", false)
		.where("User.twitch", "is not", null)
		.$narrowType<{ twitch: NotNull }>()
		.execute();
}

/** The participants' friend codes by user id, the latest one when a user has several. */
export async function findFriendCodesByTournamentId(tournamentId: number) {
	const values = await db
		.selectFrom("TournamentTeam")
		.innerJoin(
			"TournamentTeamMember",
			"TournamentTeam.id",
			"TournamentTeamMember.tournamentTeamId",
		)
		.innerJoin(
			"UserFriendCode",
			"TournamentTeamMember.userId",
			"UserFriendCode.userId",
		)
		.select(["TournamentTeamMember.userId", "UserFriendCode.friendCode"])
		.orderBy("UserFriendCode.createdAt", "asc")
		.where("TournamentTeam.tournamentId", "=", tournamentId)
		.execute();

	// later friend code overwrites earlier ones
	return values.reduce<Record<number, string>>((acc, cur) => {
		acc[cur.userId] = cur.friendCode;
		return acc;
	}, {});
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

	return (
		db
			.selectFrom("CalendarEventDate")
			// cross join pins the join order: the date window is indexed and far narrower
			// than the users' registration histories the planner walks otherwise
			.crossJoin("CalendarEvent")
			.innerJoin("Tournament", "Tournament.id", "CalendarEvent.tournamentId")
			.innerJoin(
				"TournamentTeam",
				"TournamentTeam.tournamentId",
				"Tournament.id",
			)
			.innerJoin(
				"TournamentTeamMember",
				"TournamentTeamMember.tournamentTeamId",
				"TournamentTeam.id",
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
					.where("RegisteredTeam.isPlaceholder", "=", false)
					.as("teamCount"),
			])
			.$narrowType<{ teamCount: NotNull }>()
			.whereRef("CalendarEvent.id", "=", "CalendarEventDate.eventId")
			.where("TournamentTeamMember.userId", "in", userIds)
			.where("TournamentTeam.droppedOut", "=", false)
			.where("CalendarEvent.hidden", "=", 0)
			.where("CalendarEventDate.startsAt", ">=", startsAt)
			.where("CalendarEventDate.startsAt", "<=", endsAt)
			.$if(typeof excludeTournamentId === "number", (qb) =>
				qb.where("Tournament.id", "!=", excludeTournamentId!),
			)
			.execute()
	);
}

/** Whether some team of some tournament has this image as its pickup logo; organizers copy those when importing teams. */
export function isPickupAvatarImgId(imgId: number) {
	return teamTable.exists({ avatarImgId: imgId });
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
}) {
	const teamOneMaps = await findTeamRecentMaps(
		teamIds[0],
		excludeMatchId,
		limit,
	);
	const teamTwoMaps = await findTeamRecentMaps(
		teamIds[1],
		excludeMatchId,
		limit,
	);

	return flatZip(teamOneMaps, teamTwoMaps);
}

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
		await memberTable.update({ userId, tournamentTeamId }, { inGameName }, trx);

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
	const regOpenTeams = await regOpenTournamentTeamsByJoinedUserId(userId);

	await db
		.updateTable("TournamentTeamMember")
		.set({ inGameName })
		.where("TournamentTeamMember.userId", "=", userId)
		// IGN can't be updated from here after check-in
		.where(
			"TournamentTeamMember.tournamentTeamId",
			"in",
			regOpenTeams.map((t) => t.tournamentTeamId),
		)
		// null when the tournament doesn't require IGN
		.where("TournamentTeamMember.inGameName", "is not", null)
		.execute();

	return regOpenTeams.map((t) => t.tournamentId);
}

/**
 * Creates a registration or applies an edit to an existing one (`tournamentTeamId`) in one
 * transaction: name, linked team, logo, hosting preference, owner, members, in-game names,
 * tournament names and counterpick map pool. Serves both players registering their own team and
 * organizers editing any team. The caller validates the ops and handles side effects (caches,
 * notifications). Returns the team's id and the tournament name changes actually applied (values
 * equal to the current one are no-ops), for the caller to log.
 */
export function upsertRegistration({
	tournamentTeamId,
	tournamentId,
	name,
	teamId,
	avatarImgId,
	prefersNotToHost,
	ownerUserId,
	isOrganizerAdded,
	ownerChange = null,
	membersToAdd = [],
	membersToRemove = [],
	inGameNameUpdates = [],
	tournamentNameUpdates = [],
	mapPool,
}: {
	/** Present when editing an existing team, omitted when creating a new one. */
	tournamentTeamId?: number;
	tournamentId: number;
	name: string;
	/** Linked sendou.ink team id, or null for a pickup team. */
	teamId: number | null;
	/** Resolved pickup team logo image id. `null` clears it (none / linked teams). */
	avatarImgId: number | null;
	/** Omitted means false for a new team and unchanged for an existing one. */
	prefersNotToHost?: boolean;
	/** Roster owner/captain. Assigned the OWNER role when creating a new team, so they must be in `membersToAdd`. */
	ownerUserId: number;
	/** Whether the organizer put `membersToAdd` on the roster rather than them registering themselves, which keeps them from leaving on their own. */
	isOrganizerAdded: boolean;
	/** Owner transfer for an existing team. */
	ownerChange?: { oldOwnerId: number; newOwnerId: number } | null;
	membersToAdd?: number[];
	membersToRemove?: number[];
	inGameNameUpdates?: Array<{ userId: number; inGameName: string }>;
	/** Organizer-set names shown in every tournament. `null` clears the user's current one. */
	tournamentNameUpdates?: Array<{
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
					await teamTable.insert(
						{
							tournamentId,
							name,
							inviteCode: shortNanoid(),
							prefersNotToHost: prefersNotToHost ?? false,
							teamId,
							avatarImgId,
						},
						trx,
					)
				).id
			: tournamentTeamId;

		if (!isNew) {
			const existing = await teamTable.findById(id, trx);
			invariant(existing, "Tournament team not found");
			const clearActiveRoster = (existing.activeRosterUserIds ?? []).some(
				(memberId) => membersToRemove.includes(memberId),
			);

			await teamTable.updateById(
				id,
				{
					name,
					teamId,
					avatarImgId,
					prefersNotToHost,
					...(clearActiveRoster ? { activeRosterUserIds: null } : {}),
				},
				trx,
			);

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

			await memberTable.delete({ tournamentTeamId: id, userId }, trx);
		}

		if (membersToAdd.length > 0) {
			const isSub = await registrationClosedNow(trx, tournamentId);
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
					isOrganizerAdded,
				});
			}

			await memberTable.insertMany(members, trx);

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
			await memberTable.update(
				{ tournamentTeamId: id, userId: ownerChange.oldOwnerId },
				{ role: "REGULAR" },
				trx,
			);

			await memberTable.update(
				{ tournamentTeamId: id, userId: ownerChange.newOwnerId },
				{ role: "OWNER" },
				trx,
			);
		}

		for (const { userId, inGameName } of inGameNameUpdates) {
			await memberTable.update(
				{ tournamentTeamId: id, userId },
				{ inGameName },
				trx,
			);

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
			const user = await userTable.findById(userId, trx);
			invariant(user, "User not found");
			const previousTournamentName = user.tournamentName;

			if (previousTournamentName === tournamentName) continue;

			await userTable.updateById(userId, { tournamentName }, trx);

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

		return { id, appliedTournamentNameChanges };
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
		for (const [abDivisionKey, teams = []] of Object.entries(grouped)) {
			if (teams.length === 0) continue;

			await trx
				.updateTable("TournamentTeam")
				.set({
					abDivision: abDivisionKey === "null" ? null : Number(abDivisionKey),
				})
				.where(
					"TournamentTeam.id",
					"in",
					teams.map((t) => t.tournamentTeamId),
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
		if (typeof bracketIdx === "number") {
			await checkInTable.delete({ tournamentTeamId, bracketIdx }, trx);
		} else {
			await trx
				.deleteFrom("TournamentTeamCheckIn")
				.where("TournamentTeamCheckIn.tournamentTeamId", "=", tournamentTeamId)
				.where((eb) =>
					eb.or([
						eb("TournamentTeamCheckIn.isCheckOut", "=", true),
						eb("TournamentTeamCheckIn.bracketIdx", "is", null),
					]),
				)
				.execute();
		}

		await checkInTable.insert(
			{
				checkedInAt: databaseTimestampNow(),
				tournamentTeamId,
				bracketIdx,
			},
			trx,
		);

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
		if (typeof bracketIdx === "number") {
			await checkInTable.delete({ tournamentTeamId, bracketIdx }, trx);
			await checkInTable.insert(
				{
					checkedInAt: databaseTimestampNow(),
					tournamentTeamId,
					bracketIdx,
					isCheckOut: true,
				},
				trx,
			);
		} else {
			await checkInTable.delete({ tournamentTeamId }, trx);
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
			.where("TournamentTeamCheckIn.tournamentTeamId", "=", tournamentTeamId)
			.where("TournamentTeamCheckIn.bracketIdx", "in", previewBracketIdxs)
			.execute();

		await teamTable.updateById(tournamentTeamId, { droppedOut: true }, trx);

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
		await teamTable.updateById(tournamentTeamId, { droppedOut: false }, trx);

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
				...(await chatRoomMemberIds(previousTeamIdToDelete, trx)),
			);
			await teamTable.deleteById(previousTeamIdToDelete, trx);
		}

		const newTeam = await teamTable.findById(newTeamId, trx);
		invariant(newTeam, "Tournament team not found");
		const tournamentId = newTeam.tournamentId;

		if (newTeam.chatRoomId !== null) {
			roomsChangedUserIds.push(userId);
		}

		await memberTable.insert(
			{
				tournamentTeamId: newTeamId,
				userId,
				inGameName: await resolveInGameName({ tournamentId, userId }, trx),
				isSub: await registrationClosedNow(trx, tournamentId),
				isOrganizerAdded,
			},
			trx,
		);

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

		const roomsChangedUserIds = await chatRoomMemberIds(tournamentTeamId, trx);

		await teamTable.deleteById(tournamentTeamId, trx);

		return roomsChangedUserIds;
	});
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

		await memberTable.delete({ tournamentTeamId: teamId, userId }, trx);
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
	await mapPoolMapTable.delete({ tournamentTeamId }, trx);

	await mapPoolMapTable.insertMany(
		mapPool.stageModePairs.map(({ stageId, mode }) => ({
			tournamentTeamId,
			stageId,
			mode,
		})),
		trx,
	);
}

function findTeamRecentMaps(
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

function regOpenTournamentTeamsByJoinedUserId(userId: number) {
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

/** @returns the members who lose the room when the team is deleted, empty when the team has none. */
async function chatRoomMemberIds(
	tournamentTeamId: number,
	trx: Transaction<DB>,
): Promise<number[]> {
	const team = await teamTable.findById(tournamentTeamId, trx);
	if (!team?.chatRoomId) return [];

	const members = await memberTable.findManyBy(
		{ tournamentTeamId },
		{ limit: MEMBERS_PER_TEAM_LIMIT },
		trx,
	);

	return members.map((member) => member.userId);
}

/** The team's members, owner first and then in join order. Correlates on `"TournamentTeam"."id"`. */
function membersInRosterOrder(eb: ExpressionBuilder<DB, "TournamentTeam">) {
	return eb
		.selectFrom("TournamentTeamMember")
		.whereRef("TournamentTeamMember.tournamentTeamId", "=", "TournamentTeam.id")
		.orderBy(sql`"TournamentTeamMember"."role" = 'OWNER'`, "desc")
		.orderBy("TournamentTeamMember.createdAt", "asc");
}

/** Whether the team's tournament is ranked. Correlates on `"TournamentTeam"."tournamentId"`. */
function isRankedTournamentOf(eb: ExpressionBuilder<DB, "TournamentTeam">) {
	return eb
		.selectFrom("Tournament")
		.select(
			sql<
				number | null
			>`json_extract("Tournament"."settings", '$.isRanked')`.as("isRanked"),
		)
		.whereRef("Tournament.id", "=", "TournamentTeam.tournamentId")
		.$asScalar();
}

/** The average seeding skill ordinal of the team's members. Correlates on `"TournamentTeam"."id"`. */
function averageSeedingOrdinal(
	eb: ExpressionBuilder<DB, "TournamentTeam">,
	type: Tables["SeedingSkill"]["type"],
) {
	return eb
		.selectFrom("TournamentTeamMember")
		.innerJoin("SeedingSkill", (on) =>
			on
				.onRef("SeedingSkill.userId", "=", "TournamentTeamMember.userId")
				.on("SeedingSkill.type", "=", type),
		)
		.select(({ fn }) => fn.avg<number>("SeedingSkill.ordinal").as("average"))
		.whereRef("TournamentTeamMember.tournamentTeamId", "=", "TournamentTeam.id")
		.$asScalar();
}

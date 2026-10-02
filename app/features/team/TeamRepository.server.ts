import {
	type ExpressionBuilder,
	type SqlBool,
	sql,
	type Transaction,
} from "kysely";
import { crud } from "~/db/crud";
import { defineQuery, mapRows, refine } from "~/db/entity-query";
import { db } from "~/db/sql";
import type { DB, Tables, TablesInsertable } from "~/db/tables";
import type { UserMapModePreferences } from "~/db/tables-json";
import { actorId } from "~/features/auth/core/user.server";
import * as LFGRepository from "~/features/lfg/LFGRepository.server";
import * as MatchProfileRepository from "~/features/match-profile/MatchProfileRepository.server";
import { NON_PLAYER_TEAM_ROLES, TEAM } from "~/features/team/team-constants";
import { subsOfResult } from "~/features/team/team-utils";
import { databaseTimestampNow } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import { invariant } from "~/utils/invariant";
import {
	commonUserSelect,
	concatUserSubmittedImagePrefix,
	jsonArrayFrom,
	matchProfileWeapons,
	tournamentLogoOrNull,
} from "~/utils/kysely.server";
import { toDBBoolean } from "~/utils/sql";
import { mySlugify } from "~/utils/urls";

const teamTable = crud("Team");
const memberTable = crud("AllTeamMember");
const currentMemberTable = crud("TeamMemberWithSecondary");
const mainTeamMemberTable = crud("TeamMember");

export const { updateById } = teamTable.except("customUrl", "deletedAt");

// no user can be on more teams at once
const MEMBERSHIPS_LIMIT = TEAM.MAX_TEAM_COUNT_PATRON;
// past members included, no team comes close
const MEMBERSHIPS_PER_TEAM_LIMIT = 100;

/**
 * Teams with their logo's `url`, by name. Soft-deleted teams are hidden unless a step lifts the
 * guard: `includingDeleted`.
 */
export const teams = defineQuery({
	root: "Team",
	select: (qb) =>
		qb.select((eb) => [
			"Team.id",
			"Team.customUrl",
			"Team.name",
			validatedImageUrl(eb, "Team.avatarImgId").as("avatarUrl"),
		]),
	defaultSort: [["Team.name", "asc"]],
	guards: {
		deleted: (qb) => qb.where("Team.deletedAt", "is", null),
	},
	vocabulary: ({ lift }) => ({
		/** Soft-deleted teams too, for what still points at one (a tournament team linked to it). */
		includingDeleted: () => lift("deleted"),
		nameContaining: (text: string) =>
			refine("Team", (qb) => qb.where("Team.name", "like", `%${text}%`)),
		/** Teams the user is a current member of with their membership, main team first. */
		forMember: (userId: number) =>
			refine("Team", (qb) =>
				qb
					.innerJoin(
						"TeamMemberWithSecondary as Membership",
						"Membership.teamId",
						"Team.id",
					)
					.where("Membership.userId", "=", userId)
					.select([
						"Membership.role",
						"Membership.customRole",
						"Membership.isOwner",
						"Membership.isManager",
						"Membership.isMainTeam",
					]),
			).sortedBy(["Membership.isMainTeam", "desc"], ["Team.name", "asc"]),
		mainTeamOf: (userId: number) =>
			refine("Team", (qb) =>
				qb.where("Team.id", "in", (eb) =>
					eb
						.selectFrom("TeamMember")
						.select("TeamMember.teamId")
						.where("TeamMember.userId", "=", userId),
				),
			),
		/** What the team page shows besides the roster, the banner's `url` included. */
		withProfile: () =>
			refine("Team", (qb) =>
				qb.select((eb) => [
					"Team.bio",
					"Team.bsky",
					"Team.tag",
					"Team.customTheme",
					validatedImageUrl(eb, "Team.bannerImgId").as("bannerUrl"),
				]),
			),
		/** The logo and banner images with their urls even while pending validation, for the edit form to preview. */
		withImageUploads: () =>
			refine("Team", (qb) =>
				qb.select((eb) => [
					"Team.avatarImgId",
					"Team.bannerImgId",
					uploadedImageUrl(eb, "Team.avatarImgId").as("avatarUploadUrl"),
					uploadedImageUrl(eb, "Team.bannerImgId").as("bannerUploadUrl"),
				]),
			),
		withInviteCode: () => refine("Team", (qb) => qb.select("Team.inviteCode")),
		withMapModePreferences: () =>
			refine("Team", (qb) => qb.select("Team.mapModePreferences")),
		/** The current members with their roles and match profile weapons, in roster order. */
		withMembers: () =>
			refine("Team", (qb) =>
				qb.select((eb) =>
					jsonArrayFrom(
						eb
							.selectFrom("TeamMemberWithSecondary")
							.innerJoin("User", "User.id", "TeamMemberWithSecondary.userId")
							.select((memberEb) => [
								...commonUserSelect(memberEb),
								"TeamMemberWithSecondary.role",
								"TeamMemberWithSecondary.customRole",
								"TeamMemberWithSecondary.roleType",
								"TeamMemberWithSecondary.isOwner",
								"TeamMemberWithSecondary.isManager",
								"TeamMemberWithSecondary.isMainTeam",
								"User.country",
								"User.patronTier",
								matchProfileWeapons(memberEb).as("weapons"),
							])
							.whereRef("TeamMemberWithSecondary.teamId", "=", "Team.id")
							.orderBy("TeamMemberWithSecondary.order", "asc"),
					).as("members"),
				),
			),
		/** The names of the current members who play, leaving out coaches and other staff roles, in roster order. */
		withPlayers: () =>
			refine("Team", (qb) =>
				qb.select((eb) =>
					jsonArrayFrom(
						eb
							.selectFrom("TeamMemberWithSecondary")
							.innerJoin("User", "User.id", "TeamMemberWithSecondary.userId")
							.select(["User.id", "User.username", "User.tournamentName"])
							.whereRef("TeamMemberWithSecondary.teamId", "=", "Team.id")
							.where((memberEb) =>
								memberEb.and([
									memberEb.or([
										memberEb("TeamMemberWithSecondary.role", "is", null),
										memberEb(
											"TeamMemberWithSecondary.role",
											"not in",
											NON_PLAYER_TEAM_ROLES,
										),
									]),
									memberEb.or([
										memberEb("TeamMemberWithSecondary.roleType", "is", null),
										memberEb("TeamMemberWithSecondary.roleType", "!=", "OTHER"),
									]),
								]),
							)
							.orderBy("TeamMemberWithSecondary.order", "asc"),
					).as("players"),
				),
			),
		/** The owner and managers may edit the team and manage its roster, only the owner may delete it. */
		withPermissions: () =>
			mapRows(
				"Team",
				(row: {
					members: Array<{ id: number; isOwner: number; isManager: number }>;
				}) => {
					const managerIds = row.members
						.filter((member) => member.isOwner || member.isManager)
						.map((member) => member.id);

					return {
						permissions: {
							EDIT: managerIds,
							MANAGE_ROSTER: managerIds,
							DELETE: row.members
								.filter((member) => member.isOwner)
								.map((member) => member.id),
						},
					};
				},
			),
	}),
});

/** The team with its members and who may edit it, manage its roster or delete it. */
export function teamByCustomUrl(customUrl: string) {
	return teams()
		.where({ customUrl: customUrl.toLowerCase() })
		.withMembers()
		.withPermissions();
}

/** The user's teams with their members, main team first. */
export function teamsWithMembersOf(userId: number) {
	return teams().forMember(userId).withMembers();
}

/** The team a tournament team links to, soft-deleted included: the tournament team keeps its name. */
export function linkedTeam(teamId: number) {
	return teams().where({ id: teamId }).includingDeleted();
}

export type FindResultPlacementsById = NonNullable<
	Awaited<ReturnType<typeof findResultPlacementsById>>
>;

// xxx: migrate to TournamentTeamRepo
export function findResultPlacementsById(teamId: number) {
	return db
		.selectFrom("TournamentTeam")
		.innerJoin(
			"TournamentResult",
			"TournamentResult.tournamentTeamId",
			"TournamentTeam.id",
		)
		.select(["TournamentResult.placement"])
		.where("teamId", "=", teamId)
		.groupBy("TournamentResult.tournamentId")
		.execute();
}

// xxx: migrate to TournamentTeamRepo
/** Tournament results of the team. */
export async function findResultsById(teamId: number) {
	const rows = await db
		.with("results", (cte) =>
			cte
				.selectFrom("TournamentTeam")
				.innerJoin(
					"TournamentResult",
					"TournamentResult.tournamentTeamId",
					"TournamentTeam.id",
				)
				.select([
					"TournamentResult.userId",
					"TournamentResult.tournamentTeamId",
					"TournamentResult.tournamentId",
					"TournamentResult.placement",
					"TournamentResult.participantCount",
					"TournamentTeam.startingBracketIdx",
				])
				.where("teamId", "=", teamId)
				.groupBy("TournamentResult.tournamentId"),
		)
		.selectFrom("results")
		.innerJoin(
			"CalendarEvent",
			"CalendarEvent.tournamentId",
			"results.tournamentId",
		)
		.innerJoin(
			"CalendarEventDate",
			"CalendarEventDate.eventId",
			"CalendarEvent.id",
		)
		.innerJoin("Tournament", "Tournament.id", "results.tournamentId")
		.leftJoin("TournamentDivisionTier", (join) =>
			join
				.onRef(
					"TournamentDivisionTier.tournamentId",
					"=",
					"results.tournamentId",
				)
				.on(
					sql<SqlBool>`"TournamentDivisionTier"."bracketIdx" = coalesce("results"."startingBracketIdx", 0)`,
				),
		)
		.select((eb) => [
			"results.placement",
			"results.tournamentId",
			"results.participantCount",
			"results.tournamentTeamId",
			"CalendarEvent.name as tournamentName",
			"CalendarEventDate.startsAt",
			sql<
				Tables["Tournament"]["tier"]
			>`coalesce("TournamentDivisionTier"."tier", "Tournament"."tier")`.as(
				"tier",
			),
			tournamentLogoOrNull(eb).as("logoUrl"),
			jsonArrayFrom(
				eb
					.selectFrom("results as results2")
					.innerJoin("TournamentResult", (join) =>
						join
							.onRef(
								"TournamentResult.tournamentTeamId",
								"=",
								"results2.tournamentTeamId",
							)
							.onRef(
								"TournamentResult.tournamentId",
								"=",
								"results2.tournamentId",
							),
					)
					.innerJoin("User", "User.id", "TournamentResult.userId")
					.whereRef("results2.tournamentId", "=", "results.tournamentId")
					.select((participantEb) => commonUserSelect(participantEb)),
			).as("participants"),
		])
		.orderBy("CalendarEventDate.startsAt", "desc")
		.execute();

	// past members too, subsOfResult needs who was on the roster at the time
	const members = await memberTable.findManyBy(
		{ teamId },
		{ limit: MEMBERSHIPS_PER_TEAM_LIMIT },
	);

	return rows.map((row) => ({ ...row, subs: subsOfResult(row, members) }));
}

/** Inserts the team with `ownerUserId` as its owner, returning its id and custom url. */
export function insert(
	args: Pick<TablesInsertable["Team"], "name"> & {
		ownerUserId: number;
		isMainTeam: boolean;
	},
) {
	const customUrl = mySlugify(args.name);

	return db.transaction().execute(async (trx) => {
		const team = await teamTable.insert(
			{ name: args.name, customUrl, inviteCode: shortNanoid() },
			trx,
		);

		await memberTable.insert(
			{
				userId: args.ownerUserId,
				teamId: team.id,
				isOwner: 1,
				isMainTeam: toDBBoolean(args.isMainTeam),
			},
			trx,
		);

		return { id: team.id, customUrl };
	});
}

/** Updates the team's profile, deleting the images it no longer uses. */
export function update({
	id,
	...profile
}: Pick<
	Tables["Team"],
	"id" | "name" | "bio" | "bsky" | "tag" | "avatarImgId" | "bannerImgId"
>) {
	return db.transaction().execute(async (trx) => {
		const current = await teamTable.findById(id, trx);

		const orphanedImageIds = [
			current?.avatarImgId,
			current?.bannerImgId,
		].filter(
			(imgId): imgId is number =>
				typeof imgId === "number" &&
				imgId !== profile.avatarImgId &&
				imgId !== profile.bannerImgId,
		);

		// xxx: this should prolly be a trigger which would simplify this function quite a bit, see chat rooms for example
		if (orphanedImageIds.length > 0) {
			await trx
				.deleteFrom("UnvalidatedUserSubmittedImage")
				.where("id", "in", orphanedImageIds)
				.execute();
		}

		await teamTable.updateById(
			id,
			{ ...profile, customUrl: mySlugify(profile.name) },
			trx,
		);
	});
}

/** Sets (or clears with `null`) SendouQ map/mode preferences; map pools of modes missing from the new value are kept. */
export async function updateMapModePreferences({
	id,
	mapModePreferences,
}: {
	id: number;
	mapModePreferences: UserMapModePreferences | null;
}) {
	if (!mapModePreferences) {
		await teamTable.updateById(id, { mapModePreferences: null });
		return;
	}

	const current = await teamTable.findById(id);
	invariant(current, "Team to update not found");

	const merged: UserMapModePreferences = {
		...mapModePreferences,
		pool: MatchProfileRepository.mergeExcludedModePreferences(
			mapModePreferences.pool,
			current.mapModePreferences?.pool,
		),
	};

	await teamTable.updateById(id, {
		mapModePreferences: merged,
	});
}

export function switchOwnMainTeam(teamId: number) {
	const userId = actorId();
	return db.transaction().execute(async (trx) => {
		const memberships = await currentMembershipsOf(userId, trx);
		invariant(
			memberships.some((membership) => membership.teamId === teamId),
			"User is not a member of this team",
		);

		await memberTable.update({ userId }, { isMainTeam: 0 }, trx);
		await memberTable.update({ userId, teamId }, { isMainTeam: 1 }, trx);
	});
}

/** Soft deletes the team and its LFG posts. Members whose main team it was get one of their other teams as main. */
export function deleteById(teamId: number) {
	return db.transaction().execute(async (trx) => {
		const mainTeamMembers = await mainTeamMemberTable.findManyBy(
			{ teamId },
			{ limit: MEMBERSHIPS_PER_TEAM_LIMIT },
			trx,
		);

		for (const member of mainTeamMembers) {
			const teamToSwitchTo = (
				await currentMembershipsOf(member.userId, trx)
			).find((membership) => membership.teamId !== teamId);
			if (!teamToSwitchTo) continue;

			await memberTable.update(
				{ userId: member.userId, teamId: teamToSwitchTo.teamId },
				{ isMainTeam: 1 },
				trx,
			);
		}

		await memberTable.update({ teamId }, { isMainTeam: 0 }, trx);

		await LFGRepository.deletePostsByTeamId(teamId, trx);

		await teamTable.updateById(
			teamId,
			{ deletedAt: databaseTimestampNow() },
			trx,
		);
	});
}

export function resetInviteCode(teamId: number) {
	return teamTable.updateById(teamId, { inviteCode: shortNanoid() });
}

export function insertOwnMembership({
	teamId,
	maxTeamsAllowed,
}: {
	teamId: number;
	maxTeamsAllowed: number;
}) {
	const userId = actorId();
	return db.transaction().execute(async (trx) => {
		const teamCount = (await currentMembershipsOf(userId, trx)).length;

		if (teamCount >= maxTeamsAllowed) {
			throw new Error("Trying to exceed allowed team count");
		}

		const isMainTeam = toDBBoolean(teamCount === 0);

		const maxOrder = await trx
			.selectFrom("AllTeamMember")
			.select((eb) =>
				eb.fn.coalesce(eb.fn.max("order"), sql<number>`-1`).as("maxOrder"),
			)
			.where("teamId", "=", teamId)
			.where("leftAt", "is", null)
			.executeTakeFirst();
		const order = (maxOrder?.maxOrder ?? -1) + 1;

		await trx
			.insertInto("AllTeamMember")
			.values({ userId, teamId, isMainTeam, order })
			.onConflict((oc) =>
				oc.columns(["userId", "teamId"]).doUpdateSet({
					leftAt: null,
					isMainTeam,
					order,
				}),
			)
			.execute();
	});
}

export function handleMemberLeaving({
	userId,
	teamId,
	newOwnerUserId,
}: {
	userId: number;
	teamId: number;
	newOwnerUserId?: number;
}) {
	return db
		.transaction()
		.execute((trx) => memberLeave(trx, { userId, teamId, newOwnerUserId }));
}

/** In one transaction: updates kept members' role & editor status and kicks `kickedUserIds`. */
export function updateRoster({
	teamId,
	members,
	kickedUserIds,
}: {
	teamId: number;
	members: Array<{
		userId: number;
		role: Tables["TeamMember"]["role"];
		customRole: Tables["TeamMember"]["customRole"];
		roleType: Tables["TeamMember"]["roleType"];
		isManager: boolean;
		order: number;
	}>;
	kickedUserIds: number[];
}) {
	return db.transaction().execute(async (trx) => {
		for (const userId of kickedUserIds) {
			await memberLeave(trx, { userId, teamId });
		}

		for (const { userId, isManager, ...member } of members) {
			await memberTable.update(
				{ teamId, userId },
				{ ...member, isManager: toDBBoolean(isManager) },
				trx,
			);
		}
	});
}

async function memberLeave(
	trx: Transaction<DB>,
	{
		userId,
		teamId,
		newOwnerUserId,
	}: { userId: number; teamId: number; newOwnerUserId?: number },
) {
	const memberships = await currentMembershipsOf(userId, trx);

	const teamToLeave = memberships.find(
		(membership) => membership.teamId === teamId,
	);
	invariant(teamToLeave, "User is not a member of this team");
	invariant(
		!teamToLeave.isOwner || newOwnerUserId,
		"New owner id must be provided when old is leaving",
	);

	const newMainTeam = memberships.find(
		(membership) => membership.teamId !== teamId,
	);
	if (teamToLeave.isMainTeam && newMainTeam) {
		await memberTable.update(
			{ userId, teamId: newMainTeam.teamId },
			{ isMainTeam: 1 },
			trx,
		);
	}

	await memberTable.update(
		{ userId, teamId },
		{
			leftAt: databaseTimestampNow(),
			isMainTeam: 0,
			isOwner: 0,
			isManager: 0,
		},
		trx,
	);
	if (newOwnerUserId) {
		await memberTable.update(
			{ userId: newOwnerUserId, teamId },
			{ isOwner: 1, isManager: 0 },
			trx,
		);
	}
}

/** Main team first. */
function currentMembershipsOf(userId: number, trx: Transaction<DB>) {
	return currentMemberTable.findManyBy(
		{ userId },
		{ limit: MEMBERSHIPS_LIMIT, orderBy: [["isMainTeam", "desc"]] },
		trx,
	);
}

function validatedImageUrl(
	eb: ExpressionBuilder<DB, "Team">,
	imgIdColumn: "Team.avatarImgId" | "Team.bannerImgId",
) {
	return concatUserSubmittedImagePrefix(
		eb
			.selectFrom("UserSubmittedImage")
			.select("UserSubmittedImage.url")
			.whereRef("UserSubmittedImage.id", "=", imgIdColumn)
			.$asScalar(),
	).$castTo<string | null>();
}

function uploadedImageUrl(
	eb: ExpressionBuilder<DB, "Team">,
	imgIdColumn: "Team.avatarImgId" | "Team.bannerImgId",
) {
	return concatUserSubmittedImagePrefix(
		eb
			.selectFrom("UnvalidatedUserSubmittedImage")
			.select("UnvalidatedUserSubmittedImage.url")
			.whereRef("UnvalidatedUserSubmittedImage.id", "=", imgIdColumn)
			.$asScalar(),
	).$castTo<string | null>();
}

import type { Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB, Tables, TablesInsertable } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import * as BadgeRepository from "~/features/badges/BadgeRepository.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import {
	identifierToUserIds,
	userIdsToIdentifier,
} from "~/features/mmr/mmr-utils";
import * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import * as XRankPlacementRepository from "~/features/top-search/XRankPlacementRepository.server";
import * as TrophyRepository from "~/features/trophies/TrophyRepository.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { invariant } from "~/utils/invariant";

/**
 * For a user switching Discord accounts: moves the new account's data onto the old user and deletes
 * the new one. Resolves to `null` on success, or an error message if validation fails.
 */
export function migrate(args: { newUserId: number; oldUserId: number }) {
	return db.transaction().execute(async (trx) => {
		const error = await validateMigration(trx, args);
		if (error) {
			return error;
		}

		await mergeAccountRows(trx, args);

		const deletedUser = await trx
			.deleteFrom("User")
			.where("User.id", "=", args.newUserId)
			.returning("discordId")
			.executeTakeFirstOrThrow();

		await trx
			.updateTable("User")
			.set({ discordId: deletedUser.discordId })
			.where("User.id", "=", args.oldUserId)
			.execute();

		return null;
	});
}

/**
 * For a placeholder player (`User.isPlaceholder`) turning out to be an existing user: moves the placeholder's
 * tournament history (rosters, results, skill and stats) onto the user and deletes the placeholder. Skill moves as
 * is, except in a season where the user already has skill of their own, which is kept instead. Resolves to `null`
 * on success, or an error message if validation fails.
 */
export function claimPlaceholder(args: {
	placeholderUserId: number;
	userId: number;
}) {
	return db.transaction().execute(async (trx) => {
		const error = await validateClaim(trx, args);
		if (error) {
			return error;
		}

		await moveTournamentHistory(trx, args);
		await mergeAccountRows(trx, {
			newUserId: args.placeholderUserId,
			oldUserId: args.userId,
		});

		await trx
			.deleteFrom("User")
			.where("User.id", "=", args.placeholderUserId)
			.execute();

		return null;
	});
}

/** The account merge shared by {@link migrate} and {@link claimPlaceholder}: moves the new user's rows onto the old user, dropping what would collide. */
async function mergeAccountRows(
	trx: Transaction<DB>,
	args: { newUserId: number; oldUserId: number },
) {
	// small data on the new account is dropped so it doesn't block the migration;
	// bigger things (e.g. played tournaments) still fail validation
	await trx.deleteFrom("Build").where("ownerId", "=", args.newUserId).execute();
	await trx
		.deleteFrom("UserFriendCode")
		.where("userId", "=", args.newUserId)
		.execute();
	await trx
		.deleteFrom("LFGPost")
		.where("authorId", "=", args.newUserId)
		.execute();
	await trx.deleteFrom("BanLog").where("userId", "=", args.newUserId).execute();

	await trx
		.updateTable("GroupMember")
		.where("userId", "=", args.newUserId)
		.set({ userId: args.oldUserId })
		.execute();
	await trx
		.updateTable("UnvalidatedUserSubmittedImage")
		.where("submitterUserId", "=", args.newUserId)
		.set({ submitterUserId: args.oldUserId })
		.execute();
	await trx
		.updateTable("ModNote")
		.where("userId", "=", args.newUserId)
		.set({ userId: args.oldUserId })
		.execute();

	// reports between the two merged accounts would become self-reports
	await trx
		.deleteFrom("UserReport")
		.where((eb) =>
			eb.or([
				eb.and([
					eb("reporterUserId", "=", args.newUserId),
					eb("reportedUserId", "=", args.oldUserId),
				]),
				eb.and([
					eb("reporterUserId", "=", args.oldUserId),
					eb("reportedUserId", "=", args.newUserId),
				]),
			]),
		)
		.execute();
	await deleteOlderCollidingUserReports(trx, args, "reporterUserId");
	await deleteOlderCollidingUserReports(trx, args, "reportedUserId");
	await trx
		.updateTable("UserReport")
		.where("reporterUserId", "=", args.newUserId)
		.set({ reporterUserId: args.oldUserId })
		.execute();
	await trx
		.updateTable("UserReport")
		.where("reportedUserId", "=", args.newUserId)
		.set({ reportedUserId: args.oldUserId })
		.execute();

	// special case: delete same team membership to avoid unique constraint violation
	await trx
		.deleteFrom("AllTeamMember")
		.where("userId", "=", args.oldUserId)
		.where("leftAt", "is not", null)
		.where((eb) =>
			eb(
				"AllTeamMember.teamId",
				"in",
				eb
					.selectFrom("AllTeamMember")
					.select("teamId")
					.where("userId", "=", args.newUserId)
					.where("leftAt", "is", null),
			),
		)
		.execute();

	// delete past team membership data (not user visible)
	await trx
		.deleteFrom("AllTeamMember")
		.where("userId", "=", args.newUserId)
		.where("leftAt", "is not", null)
		.execute();
	// existing team membership will stay
	await trx
		.updateTable("AllTeamMember")
		.where("userId", "=", args.newUserId)
		.set({ userId: args.oldUserId })
		.execute();

	// if both accounts own the same trophy, drop the migrated account's duplicate rows
	await trx
		.deleteFrom("TrophyOwner")
		.where("userId", "=", args.newUserId)
		.where((eb) =>
			eb.exists(
				eb
					.selectFrom("TrophyOwner as existing")
					.select("existing.trophyId")
					.where("existing.userId", "=", args.oldUserId)
					.whereRef("existing.trophyId", "=", "TrophyOwner.trophyId")
					.whereRef("existing.tournamentId", "=", "TrophyOwner.tournamentId"),
			),
		)
		.execute();
	await trx
		.deleteFrom("SpecialTrophyOwner")
		.where("userId", "=", args.newUserId)
		.where((eb) =>
			eb(
				"SpecialTrophyOwner.trophyId",
				"in",
				eb
					.selectFrom("SpecialTrophyOwner")
					.select("trophyId")
					.where("userId", "=", args.oldUserId),
			),
		)
		.execute();
	await trx
		.deleteFrom("PendingTrophyApproval")
		.where("userId", "=", args.newUserId)
		.where((eb) =>
			eb(
				"PendingTrophyApproval.pendingTrophyId",
				"in",
				eb
					.selectFrom("PendingTrophyApproval")
					.select("pendingTrophyId")
					.where("userId", "=", args.oldUserId),
			),
		)
		.execute();

	await trx
		.updateTable("TrophyOwner")
		.where("userId", "=", args.newUserId)
		.set({ userId: args.oldUserId })
		.execute();
	await trx
		.updateTable("SpecialTrophyOwner")
		.where("userId", "=", args.newUserId)
		.set({ userId: args.oldUserId })
		.execute();
	await trx
		.updateTable("Trophy")
		.where("creatorId", "=", args.newUserId)
		.set({ creatorId: args.oldUserId })
		.execute();
	await trx
		.updateTable("Trophy")
		.where("managerId", "=", args.newUserId)
		.set({ managerId: args.oldUserId })
		.execute();
	await trx
		.updateTable("PendingTrophy")
		.where("submitterUserId", "=", args.newUserId)
		.set({ submitterUserId: args.oldUserId })
		.execute();
	await trx
		.updateTable("PendingTrophy")
		.where("managerId", "=", args.newUserId)
		.set({ managerId: args.oldUserId })
		.execute();
	await trx
		.updateTable("PendingTrophy")
		.where("declinedByUserId", "=", args.newUserId)
		.set({ declinedByUserId: args.oldUserId })
		.execute();
	await trx
		.updateTable("PendingTrophyApproval")
		.where("userId", "=", args.newUserId)
		.set({ userId: args.oldUserId })
		.execute();

	await migrateBadges(trx, args);
	await trx
		.updateTable("TournamentStreamer")
		.where("userId", "=", args.newUserId)
		.set({ userId: args.oldUserId })
		.execute();
}

/** Manual grants of the same badge are merged by summing their counts; other duplicates keep the remaining user's row. */
async function migrateBadges(
	trx: Transaction<DB>,
	args: { newUserId: number; oldUserId: number },
) {
	await trx
		.deleteFrom("BadgeManager")
		.where("userId", "=", args.newUserId)
		.where((eb) =>
			eb(
				"BadgeManager.badgeId",
				"in",
				eb
					.selectFrom("BadgeManager")
					.select("badgeId")
					.where("userId", "=", args.oldUserId),
			),
		)
		.execute();
	await trx
		.updateTable("BadgeManager")
		.where("userId", "=", args.newUserId)
		.set({ userId: args.oldUserId })
		.execute();

	await trx
		.updateTable("TournamentBadgeOwner")
		.where("userId", "=", args.oldUserId)
		.where("tournamentId", "is", null)
		.set((eb) => ({
			count: eb(
				"count",
				"+",
				eb.fn.coalesce(
					eb
						.selectFrom("TournamentBadgeOwner as migrated")
						.select((inner) =>
							inner.fn.sum<number>("migrated.count").as("count"),
						)
						.where("migrated.userId", "=", args.newUserId)
						.where("migrated.tournamentId", "is", null)
						.whereRef("migrated.badgeId", "=", "TournamentBadgeOwner.badgeId"),
					eb.lit(0),
				),
			),
		}))
		.execute();
	await trx
		.deleteFrom("TournamentBadgeOwner")
		.where("userId", "=", args.newUserId)
		.where((eb) =>
			eb.exists(
				eb
					.selectFrom("TournamentBadgeOwner as existing")
					.select("existing.badgeId")
					.where("existing.userId", "=", args.oldUserId)
					.where((inner) =>
						inner.or([
							inner.and([
								inner("existing.tournamentId", "is", null),
								inner("TournamentBadgeOwner.tournamentId", "is", null),
								inner(
									"existing.badgeId",
									"=",
									inner.ref("TournamentBadgeOwner.badgeId"),
								),
							]),
							inner(
								"existing.tournamentId",
								"=",
								inner.ref("TournamentBadgeOwner.tournamentId"),
							),
						]),
					),
			),
		)
		.execute();
	await trx
		.updateTable("TournamentBadgeOwner")
		.where("userId", "=", args.newUserId)
		.set({ userId: args.oldUserId })
		.execute();

	await trx
		.updateTable("Badge")
		.where("authorId", "=", args.newUserId)
		.set({ authorId: args.oldUserId })
		.execute();
}

/** Merging can collide on the one-report-per-pair unique index; the newer report (createdAt, then id) wins. */
function deleteOlderCollidingUserReports(
	trx: Transaction<DB>,
	args: { newUserId: number; oldUserId: number },
	column: "reporterUserId" | "reportedUserId",
) {
	const otherColumn =
		column === "reporterUserId" ? "reportedUserId" : "reporterUserId";

	return trx
		.deleteFrom("UserReport")
		.where(column, "in", [args.newUserId, args.oldUserId])
		.where((eb) =>
			eb.exists(
				eb
					.selectFrom("UserReport as newer")
					.select("newer.id")
					.where(`newer.${column}`, "in", [args.newUserId, args.oldUserId])
					.whereRef(`newer.${otherColumn}`, "=", `UserReport.${otherColumn}`)
					.whereRef("newer.id", "!=", "UserReport.id")
					.where((inner) =>
						inner.or([
							inner("newer.createdAt", ">", inner.ref("UserReport.createdAt")),
							inner.and([
								inner(
									"newer.createdAt",
									"=",
									inner.ref("UserReport.createdAt"),
								),
								inner("newer.id", ">", inner.ref("UserReport.id")),
							]),
						]),
					),
			),
		)
		.execute();
}

async function validateMigration(
	trx: Transaction<DB>,
	args: { newUserId: number; oldUserId: number },
) {
	const newUserTeam = await trx
		.selectFrom("TournamentTeamMember")
		.select(["tournamentTeamId"])
		.where("userId", "=", args.newUserId)
		.executeTakeFirst();

	if (newUserTeam) {
		return "new user is in a tournament team";
	}

	const oldUserCurrentTeam = await trx
		.selectFrom("TeamMember")
		.select(["teamId"])
		.where("userId", "=", args.oldUserId)
		.executeTakeFirst();

	const newUserCurrentTeam = await trx
		.selectFrom("TeamMember")
		.select(["teamId"])
		.where("userId", "=", args.newUserId)
		.executeTakeFirst();

	if (oldUserCurrentTeam && newUserCurrentTeam) {
		return "both old and new user are in teams";
	}

	return null;
}

interface ClaimArgs {
	placeholderUserId: number;
	userId: number;
}

async function validateClaim(trx: Transaction<DB>, args: ClaimArgs) {
	const users = await trx
		.selectFrom("User")
		.select(["User.id", "User.isPlaceholder"])
		.where("User.id", "in", [args.placeholderUserId, args.userId])
		.execute();
	const placeholder = users.find((row) => row.id === args.placeholderUserId);
	const user = users.find((row) => row.id === args.userId);

	if (!placeholder?.isPlaceholder) {
		return "placeholder is not a player without an account";
	}
	if (!user || user.isPlaceholder) {
		return "user claiming it is not a player with an account";
	}

	const placeholderTournamentIds = await playedTournamentIds(
		trx,
		args.placeholderUserId,
	);
	const userTournamentIds = await playedTournamentIds(trx, args.userId);
	if ([...placeholderTournamentIds].some((id) => userTournamentIds.has(id))) {
		return "both played the same tournament";
	}

	return null;
}

async function playedTournamentIds(trx: Transaction<DB>, userId: number) {
	const rows = await trx
		.selectFrom("TournamentTeamMember")
		.innerJoin(
			"TournamentTeam",
			"TournamentTeam.id",
			"TournamentTeamMember.tournamentTeamId",
		)
		.select("TournamentTeam.tournamentId")
		.where("TournamentTeamMember.userId", "=", userId)
		.union(
			trx
				.selectFrom("TournamentResult")
				.select("TournamentResult.tournamentId")
				.where("TournamentResult.userId", "=", userId),
		)
		.execute();

	return new Set(rows.map((row) => row.tournamentId));
}

/** The tournament tables {@link mergeAccountRows} leaves alone, as an account being migrated can't have played. */
async function moveTournamentHistory(trx: Transaction<DB>, args: ClaimArgs) {
	const replaceId = (userId: number) =>
		userId === args.placeholderUserId ? args.userId : userId;

	const teams = await trx
		.selectFrom("TournamentTeamMember")
		.innerJoin(
			"TournamentTeam",
			"TournamentTeam.id",
			"TournamentTeamMember.tournamentTeamId",
		)
		.innerJoin("Tournament", "Tournament.id", "TournamentTeam.tournamentId")
		.select([
			"TournamentTeam.id",
			"TournamentTeam.activeRosterUserIds",
			"Tournament.id as tournamentId",
			"Tournament.seedingSnapshot",
		])
		.where("TournamentTeamMember.userId", "=", args.placeholderUserId)
		.execute();
	for (const team of teams) {
		if (team.activeRosterUserIds?.includes(args.placeholderUserId)) {
			await trx
				.updateTable("TournamentTeam")
				.set({
					activeRosterUserIds: JSON.stringify(
						team.activeRosterUserIds.map(replaceId),
					),
				})
				.where("TournamentTeam.id", "=", team.id)
				.execute();
		}
		if (team.seedingSnapshot) {
			await trx
				.updateTable("Tournament")
				.set({
					seedingSnapshot: JSON.stringify({
						...team.seedingSnapshot,
						teams: team.seedingSnapshot.teams.map((snapshotTeam) => ({
							...snapshotTeam,
							members: snapshotTeam.members.map((member) => ({
								...member,
								userId: replaceId(member.userId),
							})),
						})),
					}),
				})
				.where("Tournament.id", "=", team.tournamentId)
				.execute();
		}
	}

	await trx
		.updateTable("TournamentTeamMember")
		.where("userId", "=", args.placeholderUserId)
		.set({ userId: args.userId })
		.execute();
	await trx
		.updateTable("TournamentMatchGameResultParticipant")
		.where("userId", "=", args.placeholderUserId)
		.set({ userId: args.userId })
		.execute();
	await trx
		.updateTable("TournamentResult")
		.where("userId", "=", args.placeholderUserId)
		.set({ userId: args.userId })
		.execute();
	await trx
		.updateTable("TournamentAuditLog")
		.where("subjectUserId", "=", args.placeholderUserId)
		.set({ subjectUserId: args.userId })
		.execute();
	await trx
		.updateTable("TournamentAuditLog")
		.where("actorUserId", "=", args.placeholderUserId)
		.set({ actorUserId: args.userId })
		.execute();

	await moveSkills(trx, args);
	await moveStats(trx, args);
}

async function moveSkills(trx: Transaction<DB>, args: ClaimArgs) {
	await trx
		.deleteFrom("Skill")
		.where("userId", "=", args.placeholderUserId)
		.where((eb) =>
			eb(
				"Skill.season",
				"in",
				eb
					.selectFrom("Skill as own")
					.select("own.season")
					.where("own.userId", "=", args.userId),
			),
		)
		.execute();
	await trx
		.updateTable("Skill")
		.where("userId", "=", args.placeholderUserId)
		.set({ userId: args.userId })
		.execute();

	const teamSkills = await trx
		.selectFrom("SkillTeamUser")
		.innerJoin("Skill", "Skill.id", "SkillTeamUser.skillId")
		.select(["Skill.id", "Skill.identifier", "Skill.season"])
		.where("SkillTeamUser.userId", "=", args.placeholderUserId)
		.execute();
	for (const teamSkill of teamSkills) {
		invariant(teamSkill.identifier, "Team skill without an identifier");
		const identifier = userIdsToIdentifier(
			identifierToUserIds(teamSkill.identifier).map((userId) =>
				userId === args.placeholderUserId ? args.userId : userId,
			),
		);

		const ownTeamSkill = await trx
			.selectFrom("Skill")
			.select("Skill.id")
			.where("Skill.identifier", "=", identifier)
			.where("Skill.season", "=", teamSkill.season)
			.executeTakeFirst();
		if (ownTeamSkill) {
			await trx
				.deleteFrom("Skill")
				.where("Skill.id", "=", teamSkill.id)
				.execute();
			continue;
		}

		await trx
			.updateTable("Skill")
			.set({ identifier })
			.where("Skill.id", "=", teamSkill.id)
			.execute();
	}
	await trx
		.updateTable("SkillTeamUser")
		.where("userId", "=", args.placeholderUserId)
		.set({ userId: args.userId })
		.execute();

	// SeedingSkill replaces on conflict, which would overwrite the user's own
	await trx
		.deleteFrom("SeedingSkill")
		.where("userId", "=", args.placeholderUserId)
		.where((eb) =>
			eb(
				"SeedingSkill.type",
				"in",
				eb
					.selectFrom("SeedingSkill as own")
					.select("own.type")
					.where("own.userId", "=", args.userId),
			),
		)
		.execute();
	await trx
		.updateTable("SeedingSkill")
		.where("userId", "=", args.placeholderUserId)
		.set({ userId: args.userId })
		.execute();
}

/** Map and player results are counts, so rows both users have are summed into the user's. */
async function moveStats(trx: Transaction<DB>, args: ClaimArgs) {
	await trx
		.updateTable("MapResult")
		.where("MapResult.userId", "=", args.userId)
		.from("MapResult as moved")
		.whereRef("moved.stageId", "=", "MapResult.stageId")
		.whereRef("moved.mode", "=", "MapResult.mode")
		.whereRef("moved.season", "=", "MapResult.season")
		.where("moved.userId", "=", args.placeholderUserId)
		.set((eb) => ({
			wins: eb("MapResult.wins", "+", eb.ref("moved.wins")),
			losses: eb("MapResult.losses", "+", eb.ref("moved.losses")),
		}))
		.execute();
	await trx
		.deleteFrom("MapResult")
		.where("userId", "=", args.placeholderUserId)
		.where((eb) =>
			eb.exists(
				eb
					.selectFrom("MapResult as own")
					.select("own.userId")
					.where("own.userId", "=", args.userId)
					.whereRef("own.stageId", "=", "MapResult.stageId")
					.whereRef("own.mode", "=", "MapResult.mode")
					.whereRef("own.season", "=", "MapResult.season"),
			),
		)
		.execute();
	await trx
		.updateTable("MapResult")
		.where("userId", "=", args.placeholderUserId)
		.set({ userId: args.userId })
		.execute();

	// results against each other would become results against oneself
	await trx
		.deleteFrom("PlayerResult")
		.where((eb) =>
			eb.or([
				eb.and([
					eb("ownerUserId", "=", args.placeholderUserId),
					eb("otherUserId", "=", args.userId),
				]),
				eb.and([
					eb("ownerUserId", "=", args.userId),
					eb("otherUserId", "=", args.placeholderUserId),
				]),
			]),
		)
		.execute();
	await movePlayerResults(trx, args, "ownerUserId");
	await movePlayerResults(trx, args, "otherUserId");
}

async function movePlayerResults(
	trx: Transaction<DB>,
	args: ClaimArgs,
	column: "ownerUserId" | "otherUserId",
) {
	const otherColumn = column === "ownerUserId" ? "otherUserId" : "ownerUserId";

	await trx
		.updateTable("PlayerResult")
		.where(`PlayerResult.${column}`, "=", args.userId)
		.from("PlayerResult as moved")
		.whereRef(`moved.${otherColumn}`, "=", `PlayerResult.${otherColumn}`)
		.whereRef("moved.type", "=", "PlayerResult.type")
		.whereRef("moved.season", "=", "PlayerResult.season")
		.where(`moved.${column}`, "=", args.placeholderUserId)
		.set((eb) => ({
			mapWins: eb("PlayerResult.mapWins", "+", eb.ref("moved.mapWins")),
			mapLosses: eb("PlayerResult.mapLosses", "+", eb.ref("moved.mapLosses")),
			setWins: eb("PlayerResult.setWins", "+", eb.ref("moved.setWins")),
			setLosses: eb("PlayerResult.setLosses", "+", eb.ref("moved.setLosses")),
		}))
		.execute();
	await trx
		.deleteFrom("PlayerResult")
		.where(column, "=", args.placeholderUserId)
		.where((eb) =>
			eb.exists(
				eb
					.selectFrom("PlayerResult as own")
					.select("own.season")
					.where(`own.${column}`, "=", args.userId)
					.whereRef(`own.${otherColumn}`, "=", `PlayerResult.${otherColumn}`)
					.whereRef("own.type", "=", "PlayerResult.type")
					.whereRef("own.season", "=", "PlayerResult.season"),
			),
		)
		.execute();
	await trx
		.updateTable("PlayerResult")
		.where(column, "=", args.placeholderUserId)
		.set({ [column]: args.userId })
		.execute();
}

/** Replaces every `PlusTier` row, also refreshing the build sort values derived from them and dropping suggestions of the upcoming voting the new tiers made stale. */
export function replacePlusTiers(
	plusTiers: Array<{ userId: number; plusTier: number }>,
) {
	invariant(plusTiers.length > 0, "plusTiers must not be empty");

	return db.transaction().execute(async (trx) => {
		// biome-ignore lint/plugin: replaces every tier with the given ones
		await trx.deleteFrom("PlusTier").execute();
		await trx
			.insertInto("PlusTier")
			.values(
				plusTiers.map(({ plusTier, userId }) => ({ userId, tier: plusTier })),
			)
			.execute();

		await PlusSuggestionRepository.deleteAllOfMembersBeforeVoting(trx);
		await BuildRepository.recalculateAllSortValues(undefined, trx);
	});
}

export function makeVideoAdderByUserId(userId: number) {
	return db
		.updateTable("User")
		.set({ isVideoAdder: 1 })
		.where("User.id", "=", userId)
		.execute();
}

export function makeArtistByUserId(userId: number) {
	return db
		.updateTable("User")
		.set({ isArtist: 1 })
		.where("User.id", "=", userId)
		.execute();
}

export function makeTournamentOrganizerByUserId(userId: number) {
	return db
		.updateTable("User")
		.set({ isTournamentOrganizer: 1 })
		.where("User.id", "=", userId)
		.execute();
}

export function makeApiAccesserByUserId(userId: number) {
	return db
		.updateTable("User")
		.set({ isApiAccesser: 1 })
		.where("User.id", "=", userId)
		.execute();
}

export async function linkUserAndPlayer({
	userId,
	playerId,
}: {
	userId: number;
	playerId: number;
}) {
	await db
		.updateTable("SplatoonPlayer")
		.set({ userId: null })
		.where("SplatoonPlayer.userId", "=", userId)
		.execute();

	await db
		.updateTable("SplatoonPlayer")
		.set({ userId })
		.where("SplatoonPlayer.id", "=", playerId)
		.execute();

	await BadgeRepository.syncXPBadges();
	await TrophyRepository.syncSpecialTrophies();

	await BuildRepository.recalculateAllSortValues(userId);
	await XRankPlacementRepository.refreshTenStarWeapons(userId);
}

export async function forcePatron(args: {
	id: number;
	patronTier: Tables["User"]["patronTier"];
	patronStartedAt: Date;
	patronExpiresAt: Date;
}) {
	await db
		.updateTable("User")
		.set({
			patronTier: args.patronTier,
			patronStartedAt: dateToDatabaseTimestamp(args.patronStartedAt),
			patronExpiresAt: dateToDatabaseTimestamp(args.patronExpiresAt),
		})
		.where("User.id", "=", args.id)
		.execute();
}

export async function findAllBannedUsers() {
	const rows = await db
		.selectFrom("User")
		.select(["User.id as userId", "User.banned", "User.bannedReason"])
		.where("User.banned", "!=", 0)
		.execute();

	const result: Map<number, (typeof rows)[number]> = new Map();

	for (const row of rows) {
		result.set(row.userId, row);
	}

	return result;
}

/** Bans the user, logging it unless it's an automatic ban. Revokes their API tokens. */
export function banUser({
	userId,
	banned,
	bannedReason,
	bannedByUserId,
}: {
	userId: number;
	banned: 1 | Date;
	bannedReason: string | null;
	/** null means an automatic ban. */
	bannedByUserId: number | null;
}) {
	return db.transaction().execute(async (trx) => {
		const banArgs = {
			banned: banned === 1 ? banned : dateToDatabaseTimestamp(banned),
			bannedReason,
		};

		await trx
			.updateTable("User")
			.set(banArgs)
			.where("User.id", "=", userId)
			.execute();

		if (typeof bannedByUserId === "number") {
			await trx
				.insertInto("BanLog")
				.values({
					...banArgs,
					userId,
					bannedByUserId,
				})
				.execute();
		}

		await trx.deleteFrom("ApiToken").where("userId", "=", userId).execute();
	});
}

export function unbanUser({
	userId,
	unbannedByUserId,
}: {
	userId: number;
	unbannedByUserId: number;
}) {
	return db.transaction().execute(async (trx) => {
		const banArgs = {
			banned: 0,
			bannedReason: null,
		};

		await trx
			.updateTable("User")
			.set(banArgs)
			.where("User.id", "=", userId)
			.execute();

		await trx
			.insertInto("BanLog")
			.values({
				...banArgs,
				userId,
				bannedByUserId: unbannedByUserId,
			})
			.execute();
	});
}

export function addModNote(
	args: Omit<TablesInsertable["ModNote"], "authorId">,
) {
	return db
		.insertInto("ModNote")
		.values({ ...args, authorId: actorId() })
		.execute();
}

export function findModNoteById(id: number) {
	return db
		.selectFrom("ModNote")
		.selectAll()
		.where("ModNote.id", "=", id)
		.executeTakeFirst();
}

export function deleteModNote(id: number) {
	return db
		.updateTable("ModNote")
		.set({ isDeleted: 1 })
		.where("ModNote.id", "=", id)
		.execute();
}

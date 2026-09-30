import { sub } from "date-fns";
import {
	type ExpressionBuilder,
	type NotNull,
	type SqlBool,
	sql,
	type Transaction,
} from "kysely";
import * as R from "remeda";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import { ConcurrentModificationError } from "~/utils/errors";
import {
	calendarEventNameMatchesSeries,
	calendarEventStartTime,
	commonUserSelect,
	jsonArrayFrom,
	jsonObjectFrom,
	tournamentLogoWithDefault,
	tournamentTeamCount,
} from "~/utils/kysely.server";
import { getTentativeTier } from "../tournament-organization/core/tentativeTiers.server";
import { sortTrophiesByFavorites } from "../user-page/core/trophy-sorting.server";
import * as XpTrophy from "./core/XpTrophy";
import { TROPHY_APPROVALS_REQUIRED } from "./trophies-constants";
import { hasUpcomingTournamentSoon } from "./trophies-utils";

type TrophyRecentTournament = {
	tier: number | null;
	name: string;
	organizationId: number | null;
	startTime: number | null;
};

/** Tournament trophies, special ones are listed by their own functions. */
export async function all() {
	const rows = await db
		.selectFrom("Trophy")
		.select((eb) => ["id", "name", "model", withRecentTournaments(eb)])
		.where("code", "is", null)
		.execute();

	return sortByEffectiveTier(rows.map(addEffectiveTier));
}

const withRecentTournaments = (eb: ExpressionBuilder<DB, "Trophy">) =>
	jsonArrayFrom(
		eb
			.selectFrom("CalendarEvent")
			.innerJoin("Tournament", "Tournament.id", "CalendarEvent.tournamentId")
			.select((eb2) => [
				"Tournament.tier",
				"CalendarEvent.name",
				"CalendarEvent.organizationId",
				calendarEventStartTime(eb2).as("startTime"),
			])
			.whereRef("CalendarEvent.trophyId", "=", "Trophy.id")
			.where("CalendarEvent.hidden", "=", 0)
			.orderBy((eb2) => calendarEventStartTime(eb2), "desc"),
	).as("recentTournaments");

function addEffectiveTier<
	T extends { recentTournaments: Array<TrophyRecentTournament> },
>({ recentTournaments, ...rest }: T) {
	const upcomingTournamentAt = nextUpcomingStartTime(recentTournaments);

	for (const tournament of recentTournaments) {
		const tierInfo = tournamentTierInfo(tournament);
		if (tierInfo.tier !== null || tierInfo.tentativeTier !== null) {
			return { ...rest, ...tierInfo, upcomingTournamentAt };
		}
	}

	return { ...rest, tier: null, tentativeTier: null, upcomingTournamentAt };
}

function nextUpcomingStartTime(tournaments: Array<TrophyRecentTournament>) {
	const now = dateToDatabaseTimestamp(new Date());

	// ordered newest first, so the last future start time is the next one up
	const futureStartTimes = tournaments
		.map((tournament) => tournament.startTime)
		.filter(
			(startTime): startTime is number => startTime !== null && startTime > now,
		);

	return futureStartTimes.at(-1) ?? null;
}

function tournamentTierInfo(tournament: TrophyRecentTournament) {
	const isPastEvent =
		tournament.startTime !== null &&
		databaseTimestampToDate(tournament.startTime) <
			sub(new Date(), { days: 1 });

	const tentativeTier =
		tournament.tier === null &&
		tournament.organizationId !== null &&
		!isPastEvent
			? getTentativeTier(tournament.organizationId, tournament.name)
			: null;

	return { tier: tournament.tier, tentativeTier };
}

function sortByEffectiveTier<
	T extends {
		id: number;
		tier: number | null;
		tentativeTier: number | null;
		upcomingTournamentAt: number | null;
	},
>(rows: T[]) {
	return R.sortBy(
		rows,
		(row) => row.tier ?? row.tentativeTier ?? Number.MAX_SAFE_INTEGER,
		(row) => (hasUpcomingTournamentSoon(row.upcomingTournamentAt) ? 0 : 1),
		(row) => row.id,
	);
}

const withCreator = (eb: ExpressionBuilder<DB, "Trophy">) => {
	return jsonObjectFrom(
		eb
			.selectFrom("User")
			.select((userEb) => commonUserSelect(userEb))
			.whereRef("User.id", "=", "Trophy.creatorId"),
	).as("creator");
};

const withManager = (eb: ExpressionBuilder<DB, "Trophy">) => {
	return jsonObjectFrom(
		eb
			.selectFrom("User")
			.select((userEb) => commonUserSelect(userEb))
			.whereRef("User.id", "=", "Trophy.managerId"),
	).as("manager");
};

const withOrganization = (eb: ExpressionBuilder<DB, "Trophy">) => {
	return jsonObjectFrom(
		eb
			.selectFrom("TournamentOrganization")
			.select(["TournamentOrganization.name", "TournamentOrganization.slug"])
			.whereRef("TournamentOrganization.id", "=", "Trophy.organizationId"),
	).as("organization");
};

const withOwners = (eb: ExpressionBuilder<DB, "Trophy">) => {
	return jsonArrayFrom(
		eb
			.selectFrom("TrophyOwner")
			.innerJoin("User", "TrophyOwner.userId", "User.id")
			.select((ownerEb) => [
				ownerEb.fn.count<number>("TrophyOwner.trophyId").as("count"),
				...commonUserSelect(ownerEb),
			])
			.whereRef("TrophyOwner.trophyId", "=", "Trophy.id")
			.groupBy("User.id")
			.orderBy("count", "desc"),
	).as("owners");
};

const withSpecialOwners = (eb: ExpressionBuilder<DB, "Trophy">) => {
	return jsonArrayFrom(
		eb
			.selectFrom("SpecialTrophyOwner")
			.innerJoin("User", "SpecialTrophyOwner.userId", "User.id")
			.select((ownerEb) => [
				ownerEb.val(1).as("count"),
				...commonUserSelect(ownerEb),
			])
			.whereRef("SpecialTrophyOwner.trophyId", "=", "Trophy.id")
			.orderBy("User.id", "asc"),
	).as("specialOwners");
};

export async function findByOrganizationId(organizationId: number) {
	const rows = await db
		.selectFrom("Trophy")
		.select((eb) => ["id", "name", "model", withRecentTournaments(eb)])
		.where("organizationId", "=", organizationId)
		.execute();

	return sortByEffectiveTier(rows.map(addEffectiveTier));
}

export async function findByOrganizationIds(organizationIds: number[]) {
	if (organizationIds.length === 0) return [];

	return db
		.selectFrom("Trophy")
		.select(["id", "name", "model", "organizationId"])
		.where("organizationId", "in", organizationIds)
		.execute();
}

async function findOwnedTrophies(userId: number) {
	const tournamentRows = await db
		.selectFrom("TrophyOwner")
		.innerJoin("Trophy", "Trophy.id", "TrophyOwner.trophyId")
		.innerJoin("User", "User.id", "TrophyOwner.userId")
		.select(({ fn }) => [
			fn.count<number>("TrophyOwner.trophyId").as("count"),
			fn.min<number | null>("TrophyOwner.tier").as("tier"),
			"Trophy.id",
			"Trophy.name",
			"Trophy.model",
			"Trophy.code",
			"User.favoriteTrophyIds",
			"User.hiddenTrophyIds",
			"User.patronTier",
		])
		.where("TrophyOwner.userId", "=", userId)
		.groupBy(["TrophyOwner.trophyId", "TrophyOwner.userId"])
		.execute();

	const specialRows = await db
		.selectFrom("SpecialTrophyOwner")
		.innerJoin("Trophy", "Trophy.id", "SpecialTrophyOwner.trophyId")
		.innerJoin("User", "User.id", "SpecialTrophyOwner.userId")
		.select([
			"Trophy.id",
			"Trophy.name",
			"Trophy.model",
			"Trophy.code",
			"User.favoriteTrophyIds",
			"User.hiddenTrophyIds",
			"User.patronTier",
		])
		.where("SpecialTrophyOwner.userId", "=", userId)
		.execute();

	const xpPlacements = specialRows.some((row) => XpTrophy.parseCode(row.code))
		? await db
				.selectFrom("XRankPlacement")
				.innerJoin(
					"SplatoonPlayer",
					"SplatoonPlayer.id",
					"XRankPlacement.playerId",
				)
				.select([
					"XRankPlacement.weaponSplId",
					"XRankPlacement.power",
					"XRankPlacement.region",
				])
				.where("SplatoonPlayer.userId", "=", userId)
				.execute()
		: [];

	return [
		...tournamentRows.map((row) => ({ ...row, division: null })),
		...specialRows.map((row) => {
			const xpVariant = XpTrophy.parseCode(row.code);

			return {
				...row,
				count: 1,
				tier: null,
				division: xpVariant ? XpTrophy.division(xpPlacements, xpVariant) : null,
			};
		}),
	];
}

export async function findByOwnerUserId(userId: number) {
	const rows = await findOwnedTrophies(userId);

	if (rows.length === 0) return [];

	const { favoriteTrophyIds, hiddenTrophyIds, patronTier } = rows[0];
	const hiddenSet = new Set(hiddenTrophyIds ?? []);

	return sortTrophiesByFavorites({
		favoriteTrophyIds,
		hiddenTrophyIds,
		patronTier,
		trophies: rows
			.filter((row) => !hiddenSet.has(row.id))
			.map((row) =>
				R.omit(row, ["favoriteTrophyIds", "hiddenTrophyIds", "patronTier"]),
			),
	}).trophies;
}

export async function findByOwnerUserIdIncludingHidden(userId: number) {
	const rows = await findOwnedTrophies(userId);

	return rows.map((row) =>
		R.omit(row, ["favoriteTrophyIds", "hiddenTrophyIds", "patronTier"]),
	);
}

export async function findById(trophyId: number) {
	const row = await db
		.selectFrom("Trophy")
		.select((eb) => [
			"Trophy.id",
			"Trophy.name",
			"Trophy.model",
			"Trophy.code",
			"Trophy.organizationId",
			withCreator(eb),
			withManager(eb),
			withOrganization(eb),
			withOwners(eb),
			withSpecialOwners(eb),
		])
		.where("Trophy.id", "=", trophyId)
		.executeTakeFirst();

	if (!row) return null;

	const { specialOwners, ...trophy } = row;

	return {
		...trophy,
		owners: [...trophy.owners, ...specialOwners],
		permissions: trophyPermissions(trophy.manager?.id ?? null),
	};
}

export async function findTournamentsByTrophyId(trophyId: number) {
	const rows = await db
		.selectFrom("CalendarEvent")
		.innerJoin("Tournament", "Tournament.id", "CalendarEvent.tournamentId")
		.select((eb) => [
			"Tournament.id as tournamentId",
			"CalendarEvent.name",
			"CalendarEvent.organizationId",
			"Tournament.tier",
			tournamentLogoWithDefault(eb).as("logoUrl"),
			calendarEventStartTime(eb).as("startTime"),
			tournamentTeamCount(eb).as("teamsCount"),
		])
		.where("CalendarEvent.trophyId", "=", trophyId)
		.where("CalendarEvent.hidden", "=", 0)
		.orderBy("startTime", "desc")
		.execute();

	return rows.map((row) => ({
		tournamentId: row.tournamentId,
		name: row.name,
		logoUrl: row.logoUrl,
		startTime: row.startTime,
		teamsCount: row.teamsCount,
		...tournamentTierInfo(row),
	}));
}

export async function findWinsByOwner({
	trophyId,
	userId,
}: {
	trophyId: number;
	userId: number;
}) {
	const tournaments = await db
		.selectFrom("TrophyOwner")
		.innerJoin("Tournament", "Tournament.id", "TrophyOwner.tournamentId")
		.innerJoin("CalendarEvent", "CalendarEvent.tournamentId", "Tournament.id")
		.select((eb) => [
			"TrophyOwner.tournamentId",
			"TrophyOwner.tier",
			"CalendarEvent.name",
			tournamentLogoWithDefault(eb).as("logoUrl"),
			calendarEventStartTime(eb).as("startTime"),
			tournamentTeamCount(eb).as("teamsCount"),
		])
		.where("TrophyOwner.trophyId", "=", trophyId)
		.where("TrophyOwner.userId", "=", userId)
		.where("CalendarEvent.hidden", "=", 0)
		.orderBy("startTime", "desc")
		.execute();

	if (tournaments.length === 0) return [];

	const tournamentIds = tournaments.map(
		(tournament) => tournament.tournamentId,
	);

	const ownResults = await db
		.selectFrom("TournamentResult")
		.select(["tournamentId", "tournamentTeamId"])
		.where("userId", "=", userId)
		.where("tournamentId", "in", tournamentIds)
		.execute();

	const teamIds = ownResults.map((result) => result.tournamentTeamId);

	const memberRows =
		teamIds.length > 0
			? await db
					.selectFrom("TournamentResult")
					.innerJoin("User", "User.id", "TournamentResult.userId")
					.select((eb) => [
						"TournamentResult.tournamentTeamId",
						"TournamentResult.setResults",
						...commonUserSelect(eb),
					])
					.where("TournamentResult.tournamentTeamId", "in", teamIds)
					.execute()
			: [];

	const memberIds = R.unique(memberRows.map((member) => member.id));

	const weaponRows =
		memberIds.length > 0
			? await db
					.selectFrom("ReportedWeapon")
					.innerJoin(
						"TournamentMatch",
						"TournamentMatch.id",
						"ReportedWeapon.tournamentMatchId",
					)
					.innerJoin(
						"TournamentStage",
						"TournamentStage.id",
						"TournamentMatch.stageId",
					)
					.select(({ fn }) => [
						"TournamentStage.tournamentId",
						"ReportedWeapon.userId",
						"ReportedWeapon.weaponSplId",
						fn.countAll<number>().as("count"),
					])
					.where("TournamentStage.tournamentId", "in", tournamentIds)
					.where("ReportedWeapon.userId", "in", memberIds)
					.groupBy([
						"TournamentStage.tournamentId",
						"ReportedWeapon.userId",
						"ReportedWeapon.weaponSplId",
					])
					.orderBy("count", "desc")
					.execute()
			: [];

	return tournaments.map((tournament) => {
		const ownResult = ownResults.find(
			(result) => result.tournamentId === tournament.tournamentId,
		);

		const members = memberRows
			.filter(
				(member) => member.tournamentTeamId === ownResult?.tournamentTeamId,
			)
			.map((member) => ({
				...R.omit(member, ["tournamentTeamId"]),
				weapons: weaponRows
					.filter(
						(weapon) =>
							weapon.tournamentId === tournament.tournamentId &&
							weapon.userId === member.id,
					)
					.map((weapon) => weapon.weaponSplId),
			}));

		return {
			...tournament,
			members: R.sortBy(
				members,
				(member) => (member.id === userId ? 0 : 1),
				(member) => member.username.toLowerCase(),
			),
		};
	});
}

export async function findOrganizationIdById(trophyId: number) {
	const row = await db
		.selectFrom("Trophy")
		.select("organizationId")
		.where("id", "=", trophyId)
		.executeTakeFirst();

	return row?.organizationId ?? null;
}

/** Whether the name is taken by a trophy or a submission still awaiting review. */
export async function existsByName(args: {
	name: string;
	excludeTrophyId?: number;
}) {
	let trophyQuery = db
		.selectFrom("Trophy")
		.select("id")
		.where("name", "=", args.name);

	if (args.excludeTrophyId !== undefined) {
		trophyQuery = trophyQuery.where("id", "!=", args.excludeTrophyId);
	}

	const trophy = await trophyQuery.executeTakeFirst();

	if (trophy) return true;

	let pendingQuery = db
		.selectFrom("PendingTrophy")
		.select("id")
		.where("name", "=", args.name)
		.where("declinedAt", "is", null)
		.where("acceptedAt", "is", null);

	if (args.excludeTrophyId !== undefined) {
		pendingQuery = pendingQuery.where(
			"targetTrophyId",
			"is not",
			args.excludeTrophyId,
		);
	}

	const pending = await pendingQuery.executeTakeFirst();

	return Boolean(pending);
}

export function findAllXp() {
	return db
		.selectFrom("Trophy")
		.select(["Trophy.id", "Trophy.name", "Trophy.model", "Trophy.code"])
		.where("Trophy.code", "like", XpTrophy.CODE_LIKE_PATTERN)
		.execute();
}

export async function findCodeById(trophyId: number) {
	const row = await db
		.selectFrom("Trophy")
		.select("Trophy.code")
		.where("Trophy.id", "=", trophyId)
		.executeTakeFirst();

	return row?.code ?? null;
}

export function findXpWeaponCountsById({
	trophyId,
	weaponIds,
	milestone,
}: {
	trophyId: number;
	weaponIds: readonly MainWeaponId[];
	milestone: number;
}) {
	return db
		.selectFrom("XRankPlacement")
		.innerJoin("SplatoonPlayer", "SplatoonPlayer.id", "XRankPlacement.playerId")
		.innerJoin("SpecialTrophyOwner", (join) =>
			join
				.onRef("SpecialTrophyOwner.userId", "=", "SplatoonPlayer.userId")
				.on("SpecialTrophyOwner.trophyId", "=", trophyId),
		)
		.select(({ fn }) => [
			"XRankPlacement.weaponSplId",
			fn.count<number>("SplatoonPlayer.userId").distinct().as("ownerCount"),
		])
		.where("XRankPlacement.weaponSplId", "in", [...weaponIds])
		.where("XRankPlacement.power", ">=", milestone)
		.groupBy("XRankPlacement.weaponSplId")
		.orderBy("ownerCount", "desc")
		.orderBy("XRankPlacement.weaponSplId", "asc")
		.execute();
}

export async function findAllForEditing() {
	const rows = await db
		.selectFrom("Trophy")
		.select(["id", "name", "model", "organizationId", "managerId", "creatorId"])
		.where("code", "is", null)
		.execute();

	return rows.map((row) => ({
		...row,
		permissions: trophyPermissions(row.managerId),
	}));
}

export function findAllBackfillableTournaments({
	organizationId,
	substringMatches,
}: {
	organizationId: number;
	substringMatches: string[];
}) {
	return db
		.selectFrom("CalendarEvent")
		.innerJoin("Tournament", "Tournament.id", "CalendarEvent.tournamentId")
		.select((eb) => [
			"Tournament.id as tournamentId",
			"Tournament.settings",
			"CalendarEvent.name",
			tournamentLogoWithDefault(eb).as("logoUrl"),
			calendarEventStartTime(eb).as("startTime"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentResult")
					.innerJoin("User", "User.id", "TournamentResult.userId")
					.innerJoin(
						"TournamentTeam",
						"TournamentTeam.id",
						"TournamentResult.tournamentTeamId",
					)
					.select((resultEb) => [
						...commonUserSelect(resultEb),
						"TournamentResult.tournamentTeamId",
						"TournamentResult.div",
						"TournamentResult.setResults",
						"TournamentTeam.name as teamName",
					])
					.whereRef("TournamentResult.tournamentId", "=", "Tournament.id")
					.where("TournamentResult.placement", "=", 1)
					.orderBy("User.id", "asc"),
			).as("firstPlacers"),
		])
		.where("CalendarEvent.organizationId", "=", organizationId)
		.where("CalendarEvent.hidden", "=", 0)
		.where("CalendarEvent.trophyId", "is", null)
		.where("Tournament.isFinalized", "=", 1)
		.where(calendarEventNameMatchesSeries(substringMatches))
		.orderBy("startTime", "desc")
		.execute();
}

type TournamentOwnersArgs = {
	tournamentId: number;
	tournamentTeamId?: number;
	trophyId: number;
	userIds: number[];
};

export async function insertTournamentOwners(
	awards: TournamentOwnersArgs[],
	trx: Transaction<DB>,
) {
	const tieredAwards: Array<
		TournamentOwnersArgs & { tier: Awaited<ReturnType<typeof trophyTier>> }
	> = [];
	for (const award of awards) {
		tieredAwards.push({ ...award, tier: await trophyTier(trx, award) });
	}

	const rows = tieredAwards.flatMap(
		({ tournamentId, trophyId, userIds, tier }) =>
			userIds.map((userId) => ({ tournamentId, trophyId, userId, tier })),
	);
	if (rows.length === 0) return;

	await trx
		.insertInto("TrophyOwner")
		.values(rows)
		.onConflict((oc) =>
			oc.columns(["tournamentId", "userId", "trophyId"]).doNothing(),
		)
		.execute();
}

export function backfill({
	trophyId,
	awards,
}: {
	trophyId: number;
	awards: Array<Omit<TournamentOwnersArgs, "trophyId">>;
}) {
	return db.transaction().execute(async (trx) => {
		const tournamentIds = awards.map((award) => award.tournamentId);

		const { numUpdatedRows } = await trx
			.updateTable("CalendarEvent")
			.set({ trophyId })
			.where("CalendarEvent.tournamentId", "in", tournamentIds)
			.where("CalendarEvent.trophyId", "is", null)
			.executeTakeFirst();

		if (Number(numUpdatedRows) !== tournamentIds.length) {
			throw new ConcurrentModificationError(
				"A tournament to backfill already has a trophy",
			);
		}

		await insertTournamentOwners(
			awards.map((award) => ({ ...award, trophyId })),
			trx,
		);
	});
}

/**
 * Recomputes X Power trophy ownership from the Top 500 placements of linked players (see
 * {@link XpTrophy.awards}). Still-eligible owners keep their `createdAt`.
 */
export function syncSpecialTrophies() {
	return db.transaction().execute(async (trx) => {
		const trophies = await trx
			.selectFrom("Trophy")
			.select(["Trophy.id", "Trophy.code"])
			.where("Trophy.code", "like", XpTrophy.CODE_LIKE_PATTERN)
			.execute();
		if (trophies.length === 0) return;

		const placements = await trx
			.selectFrom("XRankPlacement")
			.innerJoin(
				"SplatoonPlayer",
				"SplatoonPlayer.id",
				"XRankPlacement.playerId",
			)
			.select(({ fn }) => [
				"SplatoonPlayer.userId",
				"XRankPlacement.weaponSplId",
				fn.max<number>("XRankPlacement.power").as("power"),
			])
			.where("SplatoonPlayer.userId", "is not", null)
			.groupBy(["SplatoonPlayer.userId", "XRankPlacement.weaponSplId"])
			.$narrowType<{ userId: NotNull }>()
			.execute();

		const ownerIdsByCode = R.mapValues(
			R.groupBy(XpTrophy.awards(placements), (award) => award.code),
			(awards) => awards.map((award) => award.userId),
		);

		for (const trophy of trophies) {
			await replaceSpecialTrophyOwners({
				trx,
				trophyId: trophy.id,
				userIds: (trophy.code ? ownerIdsByCode[trophy.code] : undefined) ?? [],
			});
		}
	});
}

async function replaceSpecialTrophyOwners({
	trx,
	trophyId,
	userIds,
}: {
	trx: Transaction<DB>;
	trophyId: number;
	userIds: number[];
}) {
	let deleteStale = trx
		.deleteFrom("SpecialTrophyOwner")
		.where("trophyId", "=", trophyId);
	if (userIds.length > 0) {
		deleteStale = deleteStale.where("userId", "not in", userIds);
	}
	await deleteStale.execute();

	if (userIds.length === 0) return;

	await trx
		.insertInto("SpecialTrophyOwner")
		.values(
			userIds.map((userId) => ({
				trophyId,
				userId,
				createdAt: dateToDatabaseTimestamp(new Date()),
			})),
		)
		.onConflict((oc) => oc.doNothing())
		.execute();
}

export async function createPending(args: {
	name: string;
	model: string;
	description: string;
	organizationId: number;
	submitterUserId: number;
	targetTrophyId?: number;
	managerId?: number;
	creatorId?: number;
}) {
	return db
		.insertInto("PendingTrophy")
		.values({
			name: args.name,
			model: args.model,
			description: args.description,
			organizationId: args.organizationId,
			submitterUserId: args.submitterUserId,
			createdAt: dateToDatabaseTimestamp(new Date()),
			declineReason: null,
			declinedAt: null,
			declinedByUserId: null,
			targetTrophyId: args.targetTrophyId ?? null,
			managerId: args.managerId ?? null,
			creatorId: args.creatorId ?? null,
		})
		.returning("id")
		.executeTakeFirstOrThrow();
}

const withApprovals = (eb: ExpressionBuilder<DB, "PendingTrophy">) => {
	return jsonArrayFrom(
		eb
			.selectFrom("PendingTrophyApproval")
			.innerJoin("User", "PendingTrophyApproval.userId", "User.id")
			.select([
				"PendingTrophyApproval.userId",
				"PendingTrophyApproval.createdAt",
				"User.username",
			])
			.whereRef(
				"PendingTrophyApproval.pendingTrophyId",
				"=",
				"PendingTrophy.id",
			)
			.orderBy("PendingTrophyApproval.createdAt", "asc"),
	).as("approvals");
};

const withTarget = (eb: ExpressionBuilder<DB, "PendingTrophy">) => {
	return jsonObjectFrom(
		eb
			.selectFrom("Trophy")
			.leftJoin("User", "User.id", "Trophy.managerId")
			.leftJoin("User as Creator", "Creator.id", "Trophy.creatorId")
			.leftJoin(
				"TournamentOrganization",
				"TournamentOrganization.id",
				"Trophy.organizationId",
			)
			.select([
				"Trophy.id",
				"Trophy.name",
				"Trophy.model",
				"Trophy.organizationId",
				"Trophy.managerId",
				"Trophy.creatorId",
				"User.username as managerUsername",
				"Creator.username as creatorUsername",
				"TournamentOrganization.name as organizationName",
				"TournamentOrganization.slug as organizationSlug",
			])
			.whereRef("Trophy.id", "=", "PendingTrophy.targetTrophyId"),
	).as("target");
};

const withTargetManager = (eb: ExpressionBuilder<DB, "PendingTrophy">) => {
	return jsonObjectFrom(
		eb
			.selectFrom("User")
			.select(["User.id", "User.username", "User.discordId"])
			.whereRef("User.id", "=", "PendingTrophy.managerId"),
	).as("manager");
};

const withPendingCreator = (eb: ExpressionBuilder<DB, "PendingTrophy">) => {
	return jsonObjectFrom(
		eb
			.selectFrom("User")
			.select(["User.id", "User.username", "User.discordId"])
			.whereRef("User.id", "=", "PendingTrophy.creatorId"),
	).as("creator");
};

function pendingBaseQuery() {
	return db
		.selectFrom("PendingTrophy")
		.leftJoin(
			"User as Submitter",
			"Submitter.id",
			"PendingTrophy.submitterUserId",
		)
		.leftJoin(
			"User as Decliner",
			"Decliner.id",
			"PendingTrophy.declinedByUserId",
		)
		.leftJoin(
			"TournamentOrganization",
			"TournamentOrganization.id",
			"PendingTrophy.organizationId",
		)
		.select((eb) => [
			"PendingTrophy.id",
			"PendingTrophy.name",
			"PendingTrophy.model",
			"PendingTrophy.description",
			"PendingTrophy.organizationId",
			"PendingTrophy.submitterUserId",
			"PendingTrophy.createdAt",
			"PendingTrophy.declineReason",
			"PendingTrophy.declinedAt",
			"PendingTrophy.declinedByUserId",
			"PendingTrophy.acceptedAt",
			"PendingTrophy.targetTrophyId",
			"PendingTrophy.managerId",
			"PendingTrophy.creatorId",
			"Submitter.username as submitterUsername",
			"Submitter.discordId as submitterDiscordId",
			"Decliner.username as declinedByUsername",
			"TournamentOrganization.name as organizationName",
			"TournamentOrganization.slug as organizationSlug",
			withApprovals(eb),
			withTarget(eb),
			withTargetManager(eb),
			withPendingCreator(eb),
		]);
}

export async function findPendingById(id: number) {
	const row = await pendingBaseQuery()
		.where("PendingTrophy.id", "=", id)
		.executeTakeFirst();

	return row ?? null;
}

export async function allPending() {
	return pendingBaseQuery()
		.orderBy("PendingTrophy.createdAt", "desc")
		.execute();
}

export async function pendingBySubmitter(submitterUserId: number) {
	return pendingBaseQuery()
		.where("PendingTrophy.submitterUserId", "=", submitterUserId)
		.orderBy("PendingTrophy.createdAt", "desc")
		.execute();
}

export async function unreviewedCountBySubmitter(submitterUserId: number) {
	const row = await db
		.selectFrom("PendingTrophy")
		.select((eb) => eb.fn.countAll<number>().as("count"))
		.where("submitterUserId", "=", submitterUserId)
		.where("declinedAt", "is", null)
		.where("acceptedAt", "is", null)
		.executeTakeFirstOrThrow();

	return row.count;
}

export async function deletePending(id: number) {
	await db.deleteFrom("PendingTrophy").where("id", "=", id).execute();
}

export async function declinePending(args: {
	id: number;
	reason: string;
	declinedByUserId: number;
}) {
	return db.transaction().execute(async (trx) => {
		const pending = await trx
			.selectFrom("PendingTrophy")
			.select("acceptedAt")
			.where("id", "=", args.id)
			.executeTakeFirst();

		if (!pending || pending.acceptedAt !== null) {
			return false;
		}

		await trx
			.deleteFrom("PendingTrophyApproval")
			.where("pendingTrophyId", "=", args.id)
			.execute();

		await trx
			.updateTable("PendingTrophy")
			.set({
				declineReason: args.reason,
				declinedAt: dateToDatabaseTimestamp(new Date()),
				declinedByUserId: args.declinedByUserId,
			})
			.where("id", "=", args.id)
			.execute();

		return true;
	});
}

export async function addApproval(args: {
	pendingTrophyId: number;
	userId: number;
}) {
	return db.transaction().execute(async (trx) => {
		const insertResult = await trx
			.insertInto("PendingTrophyApproval")
			.values({
				pendingTrophyId: args.pendingTrophyId,
				userId: args.userId,
				createdAt: dateToDatabaseTimestamp(new Date()),
			})
			.onConflict((oc) => oc.doNothing())
			.executeTakeFirst();

		if (!insertResult.numInsertedOrUpdatedRows) {
			return null;
		}

		const { count } = await trx
			.selectFrom("PendingTrophyApproval")
			.select((eb) => eb.fn.countAll<number>().as("count"))
			.where("pendingTrophyId", "=", args.pendingTrophyId)
			.executeTakeFirstOrThrow();

		if (count < TROPHY_APPROVALS_REQUIRED) {
			return null;
		}

		const pending = await trx
			.selectFrom("PendingTrophy")
			.select([
				"id",
				"name",
				"model",
				"organizationId",
				"submitterUserId",
				"targetTrophyId",
				"managerId",
				"creatorId",
			])
			.where("id", "=", args.pendingTrophyId)
			.where("declinedAt", "is", null)
			.where("acceptedAt", "is", null)
			.executeTakeFirst();

		if (!pending) return null;

		await trx
			.updateTable("PendingTrophy")
			.set({ acceptedAt: dateToDatabaseTimestamp(new Date()) })
			.where("id", "=", args.pendingTrophyId)
			.execute();

		if (pending.targetTrophyId !== null) {
			await trx
				.updateTable("Trophy")
				.set({
					name: pending.name,
					model: pending.model,
					organizationId: pending.organizationId,
					managerId: pending.managerId ?? pending.submitterUserId,
					...(pending.creatorId !== null
						? { creatorId: pending.creatorId }
						: {}),
				})
				.where("id", "=", pending.targetTrophyId)
				.execute();
			return { id: pending.targetTrophyId };
		}

		return trx
			.insertInto("Trophy")
			.values({
				name: pending.name,
				model: pending.model,
				organizationId: pending.organizationId,
				creatorId: pending.creatorId ?? pending.submitterUserId,
				managerId: pending.managerId ?? pending.submitterUserId,
			})
			.returning("id")
			.executeTakeFirstOrThrow();
	});
}

async function trophyTier(
	trx: Transaction<DB>,
	{
		tournamentId,
		tournamentTeamId,
	}: { tournamentId: number; tournamentTeamId?: number },
) {
	const divisionTier = tournamentTeamId
		? await trx
				.selectFrom("TournamentDivisionTier")
				.innerJoin(
					"TournamentTeam",
					"TournamentTeam.tournamentId",
					"TournamentDivisionTier.tournamentId",
				)
				.select("TournamentDivisionTier.tier")
				.where("TournamentTeam.id", "=", tournamentTeamId)
				.where(
					sql<SqlBool>`"TournamentDivisionTier"."bracketIdx" = coalesce("TournamentTeam"."startingBracketIdx", 0)`,
				)
				.executeTakeFirst()
		: undefined;

	if (divisionTier) return divisionTier.tier;

	const tournament = await trx
		.selectFrom("Tournament")
		.select("tier")
		.where("id", "=", tournamentId)
		.executeTakeFirst();

	return tournament?.tier ?? null;
}

function trophyPermissions(managerId: number | null) {
	return {
		EDIT: managerId ? [managerId] : [],
	};
}

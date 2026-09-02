import { type NotNull, sql, type Transaction } from "kysely";
import { db } from "~/db/sql";
import type { BuildWeapon, DB, TablesInsertable } from "~/db/tables";
import { modesShort } from "~/modules/in-game-lists/modes";
import type {
	Ability,
	BuildAbilitiesTuple,
	MainWeaponId,
	ModeShort,
} from "~/modules/in-game-lists/types";
import { canonicalWeaponSplId } from "~/modules/in-game-lists/weapon-ids";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { LimitReachedError } from "~/utils/errors";
import invariant from "~/utils/invariant";
import { commonUserJsonObject, jsonArrayFrom } from "~/utils/kysely.server";
import { MAIN_SLOT_AP } from "../build-analyzer/analyzer-constants";
import {
	buildToAbilityPoints,
	isStackableAbility,
} from "../build-analyzer/core/ability-points";
import { BUILD } from "./builds-constants";
import { sortAbilities } from "./core/ability-sorting.server";

export async function findAllByUserId(
	userId: number,
	options: {
		showPrivate?: boolean;
		sortAbilities?: boolean;
		limit?: number;
	} = {},
) {
	const {
		showPrivate = false,
		sortAbilities: shouldSortAbilities = false,
		limit,
	} = options;
	const rows = await db
		.selectFrom("Build")
		.select(({ eb }) => [
			"Build.id",
			"Build.title",
			"Build.description",
			"Build.modes",
			"Build.headGearSplId",
			"Build.clothesGearSplId",
			"Build.shoesGearSplId",
			"Build.updatedAt",
			"Build.isPrivate",
			"Build.abilities",
			jsonArrayFrom(
				eb
					.selectFrom("BuildWeapon")
					.select(["BuildWeapon.weaponSplId", "BuildWeapon.sortValue"])
					.orderBy("BuildWeapon.weaponSplId", "asc")
					.whereRef("BuildWeapon.buildId", "=", "Build.id"),
			).as("weapons"),
		])
		.where("Build.ownerId", "=", userId)
		.$if(!showPrivate, (qb) => qb.where("Build.isPrivate", "=", 0))
		.$if(typeof limit === "number", (qb) => qb.limit(limit!))
		.orderBy("Build.updatedAt", "desc")
		.execute();

	return rows.map((row) => ({
		...buildRowToResult(row, shouldSortAbilities),
		permissions: {
			EDIT: [userId],
		},
	}));
}

interface CreateArgs {
	ownerId: TablesInsertable["Build"]["ownerId"];
	title: TablesInsertable["Build"]["title"];
	description: TablesInsertable["Build"]["description"];
	modes: Array<ModeShort> | null;
	headGearSplId: number | null;
	clothesGearSplId: number | null;
	shoesGearSplId: number | null;
	weaponSplIds: Array<BuildWeapon["weaponSplId"]>;
	abilities: BuildAbilitiesTuple;
	isPrivate: TablesInsertable["Build"]["isPrivate"];
}

export async function insert(args: CreateArgs) {
	return db.transaction().execute(async (trx) => {
		const computed = await computeBuildData(args, trx);
		const updatedAt = dateToDatabaseTimestamp(new Date());

		const { id: buildId } = await trx
			.insertInto("Build")
			.values({
				ownerId: args.ownerId,
				title: args.title,
				description: args.description,
				modes: serializeModes(args.modes),
				headGearSplId: args.headGearSplId,
				clothesGearSplId: args.clothesGearSplId,
				shoesGearSplId: args.shoesGearSplId,
				isPrivate: args.isPrivate,
				abilities: JSON.stringify(args.abilities),
				abilitiesSignature: computed.abilitiesSignature,
				updatedAt,
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		await insertBuildChildren({ buildId, args, computed, updatedAt }, trx);

		const { count } = await trx
			.selectFrom("Build")
			.select((eb) => eb.fn.countAll<number>().as("count"))
			.where("ownerId", "=", args.ownerId)
			.executeTakeFirstOrThrow();

		if (count > BUILD.MAX_COUNT) {
			throw new LimitReachedError("Max amount of builds reached");
		}

		return { id: buildId };
	});
}

export async function update(args: CreateArgs & { id: number }) {
	return db.transaction().execute(async (trx) => {
		const computed = await computeBuildData(args, trx);
		const updatedAt = dateToDatabaseTimestamp(new Date());

		await trx
			.updateTable("Build")
			.set({
				title: args.title,
				description: args.description,
				modes: serializeModes(args.modes),
				headGearSplId: args.headGearSplId,
				clothesGearSplId: args.clothesGearSplId,
				shoesGearSplId: args.shoesGearSplId,
				isPrivate: args.isPrivate,
				abilities: JSON.stringify(args.abilities),
				abilitiesSignature: computed.abilitiesSignature,
				updatedAt,
			})
			.where("id", "=", args.id)
			.execute();

		await trx
			.deleteFrom("BuildWeapon")
			.where("buildId", "=", args.id)
			.execute();
		await trx
			.deleteFrom("BuildAbilitySum")
			.where("buildId", "=", args.id)
			.execute();
		await trx
			.deleteFrom("BuildWeaponAbility")
			.where("buildId", "=", args.id)
			.execute();

		await insertBuildChildren(
			{ buildId: args.id, args, computed, updatedAt },
			trx,
		);
	});
}

export function deleteById(id: number) {
	return db.deleteFrom("Build").where("id", "=", id).execute();
}

export async function findOwnerIdById(buildId: number) {
	const result = await db
		.selectFrom("Build")
		.select("ownerId")
		.where("id", "=", buildId)
		.executeTakeFirst();

	return result?.ownerId ?? null;
}

export async function findAllAbilityPointAverages(
	weaponSplId?: MainWeaponId | null,
) {
	// sum tables only hold public builds, so no private filter or `Build` join is needed
	if (typeof weaponSplId === "number") {
		return db
			.selectFrom("BuildWeaponAbility")
			.select(({ fn }) => [
				"BuildWeaponAbility.ability",
				fn
					.sum<number>("BuildWeaponAbility.abilityPoints")
					.as("abilityPointsSum"),
			])
			.where(
				"BuildWeaponAbility.canonicalWeaponSplId",
				"=",
				canonicalWeaponSplId(weaponSplId),
			)
			.groupBy("BuildWeaponAbility.ability")
			.execute();
	}

	return db
		.selectFrom("BuildAbilitySum")
		.select(({ fn }) => [
			"BuildAbilitySum.ability",
			fn.sum<number>("BuildAbilitySum.abilityPoints").as("abilityPointsSum"),
		])
		.groupBy("BuildAbilitySum.ability")
		.execute();
}

export async function findAllPopularAbilitiesByWeaponId(
	weaponSplId: MainWeaponId,
) {
	// one signature per user so several builds for the same weapon don't inflate several buckets;
	// the CTE picks the most recently updated one via SQLite's MAX() + bare columns rule
	// (https://www.sqlite.org/lang_select.html#bareagg)
	return db
		.with("UserSignature", (cte) =>
			cte
				.selectFrom("Build")
				.innerJoin("BuildWeapon", "BuildWeapon.buildId", "Build.id")
				.select(({ fn }) => [
					"Build.abilitiesSignature",
					fn.max("Build.updatedAt").as("latestUpdatedAt"),
				])
				.where(
					"BuildWeapon.canonicalWeaponSplId",
					"=",
					canonicalWeaponSplId(weaponSplId),
				)
				.where("Build.isPrivate", "=", 0)
				.where("Build.abilitiesSignature", "is not", null)
				.groupBy("Build.ownerId"),
		)
		.selectFrom("UserSignature")
		.select(({ fn }) => [
			"UserSignature.abilitiesSignature",
			fn.count<number>("UserSignature.abilitiesSignature").as("count"),
		])
		.groupBy("UserSignature.abilitiesSignature")
		.having((eb) => eb(eb.fn.count("UserSignature.abilitiesSignature"), ">", 1))
		.orderBy("count", "desc")
		.orderBy("UserSignature.abilitiesSignature", "asc")
		.limit(25)
		.$narrowType<{ abilitiesSignature: NotNull }>()
		.execute();
}

export type AverageAbilityPointsResult = Awaited<
	ReturnType<typeof findAllAbilityPointAverages>
>[number];

export type PopularBuildsRow = Awaited<
	ReturnType<typeof findAllPopularAbilitiesByWeaponId>
>[number];

export async function findAllByWeaponId(
	weaponId: MainWeaponId,
	options: { limit: number; sortAbilities?: boolean },
) {
	const { limit, sortAbilities: shouldSortAbilities = false } = options;

	const rows = await db
		.selectFrom("BuildWeapon")
		.innerJoin("Build", "Build.id", "BuildWeapon.buildId")
		.innerJoin("User", "User.id", "Build.ownerId")
		.leftJoin("PlusTier", "PlusTier.userId", "Build.ownerId")
		.select(({ eb }) => [
			"Build.id",
			"Build.title",
			"Build.description",
			"Build.modes",
			"Build.headGearSplId",
			"Build.clothesGearSplId",
			"Build.shoesGearSplId",
			"Build.updatedAt",
			"Build.isPrivate",
			"Build.abilities",
			"PlusTier.tier as plusTier",
			commonUserJsonObject(eb).as("owner"),
			jsonArrayFrom(
				eb
					.selectFrom("BuildWeapon as bw_inner")
					.select(["bw_inner.weaponSplId", "bw_inner.sortValue"])
					.orderBy("bw_inner.weaponSplId", "asc")
					.whereRef("bw_inner.buildId", "=", "Build.id"),
			).as("weapons"),
		])
		.where(
			"BuildWeapon.canonicalWeaponSplId",
			"=",
			canonicalWeaponSplId(weaponId),
		)
		.where("BuildWeapon.sortValue", "is not", null)
		.orderBy("BuildWeapon.sortValue", "asc")
		.orderBy("BuildWeapon.updatedAt", "desc")
		.limit(limit)
		.execute();

	return rows.map((row) => buildRowToResult(row, shouldSortAbilities));
}

/** Recomputes `BuildWeapon.sortValue` (plus tier + per-weapon top500), for one user's builds if given. */
export async function recalculateAllSortValues(
	userId?: number,
	trx?: Transaction<DB>,
) {
	if (trx) {
		return recalculateSortValues(trx, userId);
	}

	await db
		.transaction()
		.execute((newTrx) => recalculateSortValues(newTrx, userId));
}

async function recalculateSortValues(trx: Transaction<DB>, userId?: number) {
	// Pass 1: tier*2 + 1 for public, NULL for private.
	await trx
		.updateTable("BuildWeapon")
		.set({
			sortValue: sql<number | null>`(
				select case
					when "b"."isPrivate" = 1 then null
					else coalesce(
						(select "tier" from "PlusTier" where "userId" = "b"."ownerId"),
						4
					) * 2 + 1
				end
				from "Build" as "b"
				where "b"."id" = "BuildWeapon"."buildId"
			)`,
		})
		.$if(userId !== undefined, (qb) =>
			qb.where((eb) =>
				eb.exists(
					eb
						.selectFrom("Build as b")
						.select("b.id")
						.whereRef("b.id", "=", "BuildWeapon.buildId")
						.where("b.ownerId", "=", userId!),
				),
			),
		)
		.execute();

	// Pass 2: subtract 1 where this specific weapon is top500 for the owner.
	await trx
		.updateTable("BuildWeapon")
		.set({
			sortValue: sql<number>`"BuildWeapon"."sortValue" - 1`,
		})
		.where("BuildWeapon.sortValue", "is not", null)
		.where((eb) =>
			eb.exists(
				eb
					.selectFrom("Build as b")
					.innerJoin("SplatoonPlayer as sp", "sp.userId", "b.ownerId")
					.innerJoin("XRankPlacement as xrp", (join) =>
						join
							.onRef("xrp.playerId", "=", "sp.id")
							.onRef("xrp.weaponSplId", "=", "BuildWeapon.weaponSplId"),
					)
					.select("b.id")
					.whereRef("b.id", "=", "BuildWeapon.buildId")
					.$if(userId !== undefined, (qb) =>
						qb.where("b.ownerId", "=", userId!),
					),
			),
		)
		.execute();
}

function weaponIsTop500(sortValue: number | null): boolean {
	return sortValue != null && sortValue % 2 === 0;
}

interface BuildRowToResultInput {
	abilities: BuildAbilitiesTuple | null;
	weapons: Array<{ weaponSplId: MainWeaponId; sortValue: number | null }>;
}

type BuildRowToResultOutput<T extends BuildRowToResultInput> = Omit<
	T,
	"abilities" | "weapons"
> & {
	abilities: BuildAbilitiesTuple;
	weapons: Array<{ weaponSplId: MainWeaponId; isTop500: number }>;
};

function buildRowToResult<T extends BuildRowToResultInput>(
	row: T,
	shouldSortAbilities: boolean,
): BuildRowToResultOutput<T> {
	invariant(row.abilities, "expected build abilities to be populated");

	return {
		...row,
		abilities: shouldSortAbilities
			? sortAbilities(row.abilities)
			: row.abilities,
		weapons: row.weapons.map((w) => ({
			weaponSplId: w.weaponSplId,
			isTop500: weaponIsTop500(w.sortValue) ? 1 : 0,
		})),
	};
}

function serializeModes(modes: Array<ModeShort> | null) {
	if (!modes || modes.length === 0) return null;

	return JSON.stringify(
		modes.slice().sort((a, b) => modesShort.indexOf(a) - modesShort.indexOf(b)),
	);
}

interface ComputedBuildData {
	abilitySums: Array<[Ability, number]>;
	abilitiesSignature: string;
	sortValueByWeaponSplId: Map<MainWeaponId, number | null>;
}

async function computeBuildData(
	args: CreateArgs,
	trx: Transaction<DB>,
): Promise<ComputedBuildData> {
	const abilitySums = computeAbilitySums(args.abilities);

	const tier =
		(
			await trx
				.selectFrom("PlusTier")
				.select("tier")
				.where("userId", "=", args.ownerId)
				.executeTakeFirst()
		)?.tier ?? 4;

	const top500Weapons = new Set<MainWeaponId>();
	if (args.weaponSplIds.length > 0) {
		const rows = await trx
			.selectFrom("XRankPlacement")
			.innerJoin(
				"SplatoonPlayer",
				"SplatoonPlayer.id",
				"XRankPlacement.playerId",
			)
			.select("XRankPlacement.weaponSplId")
			.where("SplatoonPlayer.userId", "=", args.ownerId)
			.where("XRankPlacement.weaponSplId", "in", args.weaponSplIds)
			.distinct()
			.execute();
		for (const r of rows) top500Weapons.add(r.weaponSplId);
	}

	const sortValueByWeaponSplId = new Map<MainWeaponId, number | null>();
	for (const weaponSplId of args.weaponSplIds) {
		sortValueByWeaponSplId.set(
			weaponSplId,
			args.isPrivate
				? null
				: tier * 2 + (top500Weapons.has(weaponSplId) ? 0 : 1),
		);
	}

	return {
		abilitySums,
		abilitiesSignature: serializeSignature(abilitySums),
		sortValueByWeaponSplId,
	};
}

function computeAbilitySums(
	abilities: BuildAbilitiesTuple,
): Array<[Ability, number]> {
	const sums = buildToAbilityPoints(abilities);

	// unlike the analyzer, the sums also track main-only abilities so that
	// builds differing only by them get distinct signatures
	for (const row of abilities) {
		const mainAbility = row[0];
		if (isStackableAbility(mainAbility)) continue;

		sums.set(mainAbility, (sums.get(mainAbility) ?? 0) + MAIN_SLOT_AP);
	}

	return [...sums.entries()] as Array<[Ability, number]>;
}

function serializeSignature(sums: Array<[Ability, number]>): string {
	return sums
		.slice()
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([ability, ap]) => `${ability}_${ap}`)
		.join(",");
}

async function insertBuildChildren(
	{
		buildId,
		args,
		computed,
		updatedAt,
	}: {
		buildId: number;
		args: CreateArgs;
		computed: ComputedBuildData;
		updatedAt: number;
	},
	trx: Transaction<DB>,
) {
	await trx
		.insertInto("BuildWeapon")
		.values(
			args.weaponSplIds.map((weaponSplId) => ({
				buildId,
				weaponSplId,
				canonicalWeaponSplId: canonicalWeaponSplId(weaponSplId),
				sortValue: computed.sortValueByWeaponSplId.get(weaponSplId) ?? null,
				updatedAt,
			})),
		)
		.execute();

	// private builds are excluded so the stats queries are pure covering-index scans;
	// visibility flips are handled by `update`'s delete-then-reinsert
	if (args.isPrivate) return;

	await trx
		.insertInto("BuildAbilitySum")
		.values(
			computed.abilitySums.map(([ability, abilityPoints]) => ({
				buildId,
				ability,
				abilityPoints,
			})),
		)
		.execute();

	const weaponAbilityRows: TablesInsertable["BuildWeaponAbility"][] =
		args.weaponSplIds.flatMap((weaponSplId) =>
			computed.abilitySums.map(([ability, abilityPoints]) => ({
				canonicalWeaponSplId: canonicalWeaponSplId(weaponSplId),
				buildId,
				ability,
				abilityPoints,
			})),
		);
	await trx
		.insertInto("BuildWeaponAbility")
		.values(weaponAbilityRows)
		.execute();
}

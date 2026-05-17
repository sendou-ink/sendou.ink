import { type NotNull, sql, type Transaction } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/sqlite";
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
import { commonUserJsonObject } from "~/utils/kysely.server";
import {
	MAIN_SLOT_AP,
	SUB_SLOT_AP,
} from "../build-analyzer/analyzer-constants";
import { BUILD } from "./builds-constants";
import { sortAbilities } from "./core/ability-sorting.server";

export async function allByUserId(
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
			"Build.private",
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
		.$if(!showPrivate, (qb) => qb.where("Build.private", "=", 0))
		.$if(typeof limit === "number", (qb) => qb.limit(limit!))
		.orderBy("Build.updatedAt", "desc")
		.execute();

	return rows.map((row) => buildRowToResult(row, shouldSortAbilities));
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
	private: TablesInsertable["Build"]["private"];
}

// xxx: some tests for the computeBuildData stuff would be nice
export async function create(args: CreateArgs) {
	return db.transaction().execute(async (trx) => {
		const computed = await computeBuildData(trx, args);
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
				private: args.private,
				abilities: JSON.stringify(args.abilities),
				abilitiesSignature: computed.abilitiesSignature,
				updatedAt,
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		await insertBuildChildrenInTrx({
			trx,
			buildId,
			args,
			computed,
			updatedAt,
		});

		const { count } = await trx
			.selectFrom("Build")
			.select((eb) => eb.fn.countAll<number>().as("count"))
			.where("ownerId", "=", args.ownerId)
			.executeTakeFirstOrThrow();

		if (count > BUILD.MAX_COUNT) {
			throw new LimitReachedError("Max amount of builds reached");
		}
	});
}

export async function update(args: CreateArgs & { id: number }) {
	return db.transaction().execute(async (trx) => {
		const computed = await computeBuildData(trx, args);
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
				private: args.private,
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

		await insertBuildChildrenInTrx({
			trx,
			buildId: args.id,
			args,
			computed,
			updatedAt,
		});
	});
}

export function deleteById(id: number) {
	return db.deleteFrom("Build").where("id", "=", id).execute();
}

export async function ownerIdById(buildId: number) {
	const result = await db
		.selectFrom("Build")
		.select("ownerId")
		.where("id", "=", buildId)
		.executeTakeFirst();

	return result?.ownerId ?? null;
}

// xxx: or should we use SQLite AVG()?
export async function abilityPointAverages(weaponSplId?: MainWeaponId | null) {
	// Sum tables only contain rows for public builds,
	// so the queries below need no private filter and no `Build` join.
	if (typeof weaponSplId === "number") {
		// BuildWeaponAbility's weaponSplId is canonical (alt skins folded into
		// their base, see write path + migration backfill), so a single `= ?`
		// against the covering index gives the full picture.
		return db
			.selectFrom("BuildWeaponAbility")
			.select(({ fn }) => [
				"BuildWeaponAbility.ability",
				fn
					.sum<number>("BuildWeaponAbility.abilityPoints")
					.as("abilityPointsSum"),
			])
			.where(
				"BuildWeaponAbility.weaponSplId",
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

export async function popularAbilitiesByWeaponId(weaponSplId: MainWeaponId) {
	// `count` is distinct users, not distinct build rows — otherwise one user
	// with many copies of the same build would dominate the list.
	return db
		.selectFrom("Build")
		.innerJoin("BuildWeapon", "BuildWeapon.buildId", "Build.id")
		.select(({ fn }) => [
			"Build.abilitiesSignature",
			fn.count<number>("Build.ownerId").distinct().as("count"),
		])
		.where(
			"BuildWeapon.canonicalWeaponSplId",
			"=",
			canonicalWeaponSplId(weaponSplId),
		)
		.where("Build.private", "=", 0)
		.where("Build.abilitiesSignature", "is not", null)
		.groupBy("Build.abilitiesSignature")
		.having((eb) => eb(eb.fn.count("Build.ownerId").distinct(), ">", 1))
		.orderBy("count", "desc")
		.orderBy("Build.abilitiesSignature", "asc")
		.limit(25)
		.$narrowType<{ abilitiesSignature: NotNull }>()
		.execute();
}

export type AverageAbilityPointsResult = Awaited<
	ReturnType<typeof abilityPointAverages>
>[number];

export type PopularBuildsRow = Awaited<
	ReturnType<typeof popularAbilitiesByWeaponId>
>[number];

export async function allByWeaponId(
	weaponId: MainWeaponId,
	options: { limit: number; sortAbilities?: boolean },
) {
	const { limit, sortAbilities: shouldSortAbilities = false } = options;

	// `ordered` CTE — two nesting levels:
	//   1. Inner `bounded`: covering-index scan capped at `limit * 3` (max 3
	//      alt skins per canonical weapon). Bounding here keeps the scan
	//      streaming; without it, GROUP BY would force SQLite to materialize
	//      the full matching set for popular weapons.
	//   2. Outer: GROUP BY buildId to dedup alt-skin rows down to one per
	//      build, ordered + limited for the final hydrate.
	// `updatedAt` is in the group key because it's a mirror of `Build.updatedAt`
	// (set identically on every BuildWeapon row for a buildId at insert time),
	// so (buildId, updatedAt) is 1:1 and no aggregate is needed for it.
	const rows = await db
		.with("ordered", (qb) =>
			qb
				.selectFrom((eb) =>
					eb
						.selectFrom("BuildWeapon")
						.select([
							"BuildWeapon.buildId",
							"BuildWeapon.sortValue",
							"BuildWeapon.updatedAt",
						])
						.where(
							"BuildWeapon.canonicalWeaponSplId",
							"=",
							canonicalWeaponSplId(weaponId),
						)
						.where("BuildWeapon.sortValue", "is not", null)
						.orderBy("BuildWeapon.sortValue", "asc")
						.orderBy("BuildWeapon.updatedAt", "desc")
						.limit(limit * 3)
						.as("bounded"),
				)
				.select((eb) => [
					"bounded.buildId",
					eb.fn.min("bounded.sortValue").as("sortValue"),
					"bounded.updatedAt",
				])
				.groupBy(["bounded.buildId", "bounded.updatedAt"])
				.orderBy("sortValue", "asc")
				.orderBy("bounded.updatedAt", "desc")
				.limit(limit),
		)
		.selectFrom("ordered")
		.innerJoin("Build", "Build.id", "ordered.buildId")
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
			"Build.private",
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
		.orderBy("ordered.sortValue", "asc")
		.orderBy("ordered.updatedAt", "desc")
		.execute();

	return rows.map((row) => buildRowToResult(row, shouldSortAbilities));
}

/** Recomputes `BuildWeapon.sortValue` for every (build, weapon) from scratch
 * (plus tier + per-weapon top500). */
export async function recalculateAllSortValues() {
	await db.transaction().execute(async (trx) => {
		// Pass 1: tier*2 + 1 for public, NULL for private.
		await trx
			.updateTable("BuildWeapon")
			.set({
				sortValue: sql<number | null>`(
					select case
						when "b"."private" = 1 then null
						else coalesce(
							(select "tier" from "PlusTier" where "userId" = "b"."ownerId"),
							4
						) * 2 + 1
					end
					from "Build" as "b"
					where "b"."id" = "BuildWeapon"."buildId"
				)`,
			})
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
						.whereRef("b.id", "=", "BuildWeapon.buildId"),
				),
			)
			.execute();
	});
}

// ---

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
	trx: Transaction<DB>,
	args: CreateArgs,
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
			args.private ? null : tier * 2 + (top500Weapons.has(weaponSplId) ? 0 : 1),
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
	const sums = new Map<Ability, number>();
	for (const row of abilities) {
		for (let slotIdx = 0; slotIdx < row.length; slotIdx++) {
			const ability = row[slotIdx];
			const ap = slotIdx === 0 ? MAIN_SLOT_AP : SUB_SLOT_AP;
			sums.set(ability, (sums.get(ability) ?? 0) + ap);
		}
	}
	return [...sums.entries()];
}

function serializeSignature(sums: Array<[Ability, number]>): string {
	return sums
		.slice()
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([ability, ap]) => `${ability}_${ap}`)
		.join(",");
}

async function insertBuildChildrenInTrx({
	trx,
	buildId,
	args,
	computed,
	updatedAt,
}: {
	trx: Transaction<DB>;
	buildId: number;
	args: CreateArgs;
	computed: ComputedBuildData;
	updatedAt: number;
}) {
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

	// Private builds are excluded from the sum tables so the stats queries can
	// run as pure covering-index scans. Visibility flips are handled implicitly
	// by `update`'s delete-then-reinsert.
	if (args.private) return;

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

	// Dedup by (canonical weapon, ability): a build that lists e.g. both Splattershot
	// and Hero Shot Replica only contributes one BuildWeaponAbility row per
	// ability — required by the unique(weaponSplId, buildId, ability) constraint.
	const seen = new Set<string>();
	const weaponAbilityRows: TablesInsertable["BuildWeaponAbility"][] = [];
	for (const weaponSplId of args.weaponSplIds) {
		const canonical = canonicalWeaponSplId(weaponSplId);
		for (const [ability, abilityPoints] of computed.abilitySums) {
			const key = `${canonical}:${ability}`;
			if (seen.has(key)) continue;
			seen.add(key);
			weaponAbilityRows.push({
				weaponSplId: canonical,
				buildId,
				ability,
				abilityPoints,
			});
		}
	}
	if (weaponAbilityRows.length > 0) {
		await trx
			.insertInto("BuildWeaponAbility")
			.values(weaponAbilityRows)
			.execute();
	}
}

import {
	type Expression,
	type NotNull,
	type SelectQueryBuilder,
	type SqlBool,
	sql,
	type Transaction,
} from "kysely";
import * as R from "remeda";
import * as Pagination from "~/db/pagination.server";
import { db } from "~/db/sql";
import type { BuildWeapon, DB, TablesInsertable } from "~/db/tables";
import {
	type BuildSort,
	DEFAULT_BUILD_SORT,
} from "~/features/user-page/user-page-constants";
import { modesShort } from "~/modules/in-game-lists/modes";
import type {
	Ability,
	BuildAbilitiesTuple,
	MainWeaponId,
	ModeShort,
} from "~/modules/in-game-lists/types";
import {
	canonicalWeaponSplId,
	weaponIdToBaseWeaponId,
} from "~/modules/in-game-lists/weapon-ids";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import { LimitReachedError } from "~/utils/errors";
import { invariant } from "~/utils/invariant";
import { commonUserJsonObject, jsonArrayFrom } from "~/utils/kysely.server";
import { toDBBoolean } from "~/utils/sql";
import { assertUnreachable } from "~/utils/types";
import {
	MAIN_SLOT_AP,
	SUB_SLOT_AP,
} from "../build-analyzer/analyzer-constants";
import {
	buildToAbilityPoints,
	isStackableAbility,
} from "../build-analyzer/core/ability-points";
import { BUILD, BUILDS_PAGE_SIZE } from "./builds-constants";
import type { AbilityFilter } from "./builds-types";
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
		const updatedAt = databaseTimestampNow();

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
		const updatedAt = databaseTimestampNow();

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

/** Ability point sums of every public build updated after the date (`YYYY-MM-DD`, all when null), a build counted once however many weapons it lists. */
export async function findAllAbilityPointSums(updatedSince: string | null) {
	// sum tables only hold public builds, so no private filter is needed
	const sums = db
		.selectFrom("BuildAbilitySum")
		.$if(updatedSince !== null, (qb) =>
			qb.where(
				"BuildAbilitySum.buildId",
				"in",
				db
					.selectFrom("Build")
					.select("Build.id")
					.where("Build.updatedAt", ">", toTimestamp(updatedSince!)),
			),
		);

	const abilities = await sums
		.select(({ fn }) => [
			"BuildAbilitySum.ability",
			fn.sum<number>("BuildAbilitySum.abilityPoints").as("abilityPointsSum"),
		])
		.groupBy("BuildAbilitySum.ability")
		.execute();

	const { buildsCount } = await sums
		.select(({ fn }) =>
			fn.count<number>("BuildAbilitySum.buildId").distinct().as("buildsCount"),
		)
		.executeTakeFirstOrThrow();

	return { abilities, buildsCount };
}

/**
 * For each of the weapons (alt skins folded), how many public builds updated after the date (`YYYY-MM-DD`, all when null)
 * run each amount of AP of each ability, plus their build counts.
 */
export async function findAbilityPointCountsByWeaponIds({
	weaponIds,
	updatedSince,
}: {
	weaponIds: MainWeaponId[];
	updatedSince: string | null;
}) {
	const rows = db
		.selectFrom("BuildWeaponAbility")
		.where(
			"BuildWeaponAbility.canonicalWeaponSplId",
			"in",
			R.unique(weaponIds.map(canonicalWeaponSplId)),
		)
		.$if(updatedSince !== null, (qb) =>
			qb.where((eb) =>
				eb.exists(
					eb
						.selectFrom("BuildWeapon")
						.select("BuildWeapon.buildId")
						.whereRef("BuildWeapon.buildId", "=", "BuildWeaponAbility.buildId")
						.whereRef(
							"BuildWeapon.canonicalWeaponSplId",
							"=",
							"BuildWeaponAbility.canonicalWeaponSplId",
						)
						.where("BuildWeapon.updatedAt", ">", toTimestamp(updatedSince!)),
				),
			),
		);

	const abilityPointCounts = await rows
		.select(({ fn }) => [
			"BuildWeaponAbility.canonicalWeaponSplId as weaponSplId",
			"BuildWeaponAbility.ability",
			"BuildWeaponAbility.abilityPoints",
			fn.countAll<number>().as("buildsCount"),
		])
		.groupBy([
			"BuildWeaponAbility.canonicalWeaponSplId",
			"BuildWeaponAbility.ability",
			"BuildWeaponAbility.abilityPoints",
		])
		.execute();

	const buildCounts = await rows
		.select(({ fn }) => [
			"BuildWeaponAbility.canonicalWeaponSplId as weaponSplId",
			fn
				.count<number>("BuildWeaponAbility.buildId")
				.distinct()
				.as("buildsCount"),
		])
		.groupBy("BuildWeaponAbility.canonicalWeaponSplId")
		.execute();

	return { abilityPointCounts, buildCounts };
}

/** The newest public build of each owner listing the weapon (alt skins folded), if updated after the date (`YYYY-MM-DD`, any time when null). */
export async function findNewestBuildPerOwnerByWeaponId({
	weaponId,
	updatedSince,
}: {
	weaponId: MainWeaponId;
	updatedSince: string | null;
}) {
	// picks the most recently updated build via SQLite's MAX() + bare columns rule
	// (https://www.sqlite.org/lang_select.html#bareagg)
	const rows = await db
		.selectFrom("Build")
		.innerJoin("BuildWeapon", "BuildWeapon.buildId", "Build.id")
		.select(({ fn }) => [
			"Build.abilitiesSignature",
			"Build.abilities",
			"Build.modes",
			fn.max("Build.updatedAt").as("latestUpdatedAt"),
		])
		.where(
			"BuildWeapon.canonicalWeaponSplId",
			"=",
			canonicalWeaponSplId(weaponId),
		)
		.where("Build.isPrivate", "=", 0)
		.where("Build.abilitiesSignature", "is not", null)
		.$if(updatedSince !== null, (qb) =>
			qb.where("Build.updatedAt", ">", toTimestamp(updatedSince!)),
		)
		.groupBy("Build.ownerId")
		.$narrowType<{ abilitiesSignature: NotNull }>()
		.execute();

	return rows.map((row) => {
		invariant(row.abilities, "expected build abilities to be populated");

		return {
			abilitiesSignature: row.abilitiesSignature,
			abilities: sortAbilities(row.abilities),
			modes: row.modes,
		};
	});
}

/** Filters shared by the build lists, each a no-op when unset. */
export interface BuildListFilters {
	/** Every one has to hold, AP counted like the analyzer does (ability doubler included). */
	abilities: AbilityFilter[];
	mode: ModeShort | null;
	/** `YYYY-MM-DD`, only builds updated after it. */
	date: string | null;
}

/**
 * A page of the authors of public builds listing the weapon (alt skins folded) that match the filters, with
 * all of their matching builds. Authors rank by their best ranked build and their builds come together, best first.
 * `buildCount` counts every matching build but only while filtering (null otherwise, as it would cost an extra read).
 */
export async function findPageByWeaponId({
	weaponId,
	filters,
	page,
	sortAbilities: shouldSortAbilities,
}: {
	weaponId: MainWeaponId;
	filters: BuildListFilters;
	page: number;
	sortAbilities: boolean;
}) {
	const canonicalId = canonicalWeaponSplId(weaponId);

	// `Build` is only read for the mode filter: a row lookup per build is most of an unfiltered count's cost
	const matchingBuildWeapons = db
		.selectFrom("BuildWeapon")
		.where("BuildWeapon.canonicalWeaponSplId", "=", canonicalId)
		.where("BuildWeapon.sortValue", "is not", null)
		.where((eb) =>
			eb.and(
				filterConditions(filters, {
					abilityPointsAtLeast: (ability, ap) =>
						// an index probe (only public builds have these rows, as only they are listed here)
						eb.exists(
							eb
								.selectFrom("BuildWeaponAbility")
								.select("BuildWeaponAbility.buildId")
								.where(
									"BuildWeaponAbility.canonicalWeaponSplId",
									"=",
									canonicalId,
								)
								.whereRef(
									"BuildWeaponAbility.buildId",
									"=",
									"BuildWeapon.buildId",
								)
								.where("BuildWeaponAbility.ability", "=", ability)
								.where("BuildWeaponAbility.abilityPoints", ">=", ap),
						),
					onBuild: (condition) =>
						eb.exists(
							eb
								.selectFrom("Build")
								.select("Build.id")
								.whereRef("Build.id", "=", "BuildWeapon.buildId")
								.where(condition),
						),
					updatedAt: "BuildWeapon.updatedAt",
				}),
			),
		);

	const { ownerIds, ownerCount, buildCount } = await findOwnersPage({
		query: matchingBuildWeapons,
		page,
		isFiltered:
			filters.abilities.length > 0 ||
			filters.mode !== null ||
			filters.date !== null,
	});

	if (ownerIds.length === 0) return { builds: [], ownerCount, buildCount };

	const buildWeapons = await bestRankedFirst(
		matchingBuildWeapons
			.select(["BuildWeapon.buildId", "BuildWeapon.ownerId"])
			.where("BuildWeapon.ownerId", "in", ownerIds),
	).execute();
	const ownerPosition = new Map(ownerIds.map((id, i) => [id, i]));
	const buildIds = R.sortBy(
		buildWeapons,
		(buildWeapon) => ownerPosition.get(buildWeapon.ownerId)!,
	).map((buildWeapon) => buildWeapon.buildId);

	const rows = await buildRowsByIds(buildIds)
		.innerJoin("User", "User.id", "Build.ownerId")
		.leftJoin("PlusTier", "PlusTier.userId", "Build.ownerId")
		.select(({ eb }) => [
			"PlusTier.tier as plusTier",
			commonUserJsonObject(eb).as("owner"),
		])
		.execute();
	const rowsById = new Map(rows.map((row) => [row.id, row]));

	return {
		builds: buildIds.map((id) =>
			buildRowToResult(rowsById.get(id)!, shouldSortAbilities),
		),
		ownerCount,
		buildCount,
	};
}

/** A page of the user's builds matching the filters, in their chosen sort order. */
export async function findPageByUserId({
	userId,
	showPrivate,
	filters,
	sorting,
	page,
	sortAbilities: shouldSortAbilities,
}: {
	userId: number;
	showPrivate: boolean;
	filters: BuildListFilters & {
		/** Exact weapon id, alt skins and kits not folded. */
		weaponId: MainWeaponId | null;
		visibility: "PUBLIC" | "PRIVATE" | null;
	};
	sorting: {
		buildSorting: BuildSort[] | null;
		weaponPool: MainWeaponId[];
	};
	page: number;
	sortAbilities: boolean;
}) {
	const { items, totalCount } = await Pagination.findPage({
		query: db
			.selectFrom("Build")
			.where("Build.ownerId", "=", userId)
			.$if(!showPrivate, (qb) => qb.where("Build.isPrivate", "=", 0))
			.where((eb) =>
				eb.and([
					...filterConditions(filters, {
						// private builds have no ability sum rows to probe
						abilityPointsAtLeast: (ability, ap) =>
							sql<SqlBool>`(select coalesce(sum(case when "slot"."key" = 0 then ${MAIN_SLOT_AP} when json_extract("gear"."value", '$[0]') = 'AD' then ${SUB_SLOT_AP * 2} else ${SUB_SLOT_AP} end), 0) from json_each("Build"."abilities") as "gear", json_each("gear"."value") as "slot" where "slot"."value" = ${ability}) >= ${ap}`,
						onBuild: (condition) => condition,
						updatedAt: "Build.updatedAt",
					}),
					...(filters.weaponId !== null
						? [
								eb.exists(
									eb
										.selectFrom("BuildWeapon")
										.select("BuildWeapon.buildId")
										.whereRef("BuildWeapon.buildId", "=", "Build.id")
										.where("BuildWeapon.weaponSplId", "=", filters.weaponId),
								),
							]
						: []),
					...(filters.visibility !== null
						? [
								eb(
									"Build.isPrivate",
									"=",
									filters.visibility === "PRIVATE" ? 1 : 0,
								),
							]
						: []),
				]),
			),
		id: "Build.id",
		orderBy: [
			...(sorting.buildSorting ?? DEFAULT_BUILD_SORT).flatMap((sort) =>
				userBuildSortKeys(sort, sorting.weaponPool),
			),
			// ties keep the newest first
			["Build.updatedAt", "desc"],
		],
		page,
		pageSize: BUILDS_PAGE_SIZE,
		rowsByIds: (ids) => buildRowsByIds(ids).execute(),
	});

	return {
		builds: items.map((row) => ({
			...buildRowToResult(row, shouldSortAbilities),
			permissions: {
				EDIT: [userId],
			},
		})),
		totalCount,
	};
}

/** How many builds the user has, how many of them are private and the count per (exact) weapon id. */
export async function countsByUserId(
	userId: number,
	{ showPrivate }: { showPrivate: boolean },
) {
	const totals = await db
		.selectFrom("Build")
		.select(({ fn }) => [
			fn.countAll<number>().as("total"),
			fn.sum<number | null>("Build.isPrivate").as("private"),
		])
		.where("Build.ownerId", "=", userId)
		.$if(!showPrivate, (qb) => qb.where("Build.isPrivate", "=", 0))
		.executeTakeFirstOrThrow();

	const weaponCounts = await db
		.selectFrom("Build")
		.innerJoin("BuildWeapon", "BuildWeapon.buildId", "Build.id")
		.select(({ fn }) => [
			"BuildWeapon.weaponSplId",
			fn.countAll<number>().as("count"),
		])
		.where("Build.ownerId", "=", userId)
		.$if(!showPrivate, (qb) => qb.where("Build.isPrivate", "=", 0))
		.groupBy("BuildWeapon.weaponSplId")
		.execute();

	return {
		total: totals.total,
		private: totals.private ?? 0,
		byWeaponId: Object.fromEntries(
			weaponCounts.map((row) => [row.weaponSplId, row.count]),
		) as Partial<Record<MainWeaponId, number>>,
	};
}

/** Public build count per canonical weapon id (alt skins folded), weapons without builds omitted. */
export async function countAllPublicByWeaponId() {
	const rows = await db
		.selectFrom("BuildWeapon")
		.select(({ fn }) => [
			"BuildWeapon.canonicalWeaponSplId as weaponSplId",
			fn.countAll<number>().as("count"),
		])
		.where("BuildWeapon.sortValue", "is not", null)
		.groupBy("BuildWeapon.canonicalWeaponSplId")
		.execute();

	return new Map(rows.map((row) => [row.weaponSplId, row.count]));
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

/** The filters as SQL conditions, each list checking abilities and reaching the `Build` row its own way. */
function filterConditions(
	{ abilities, mode, date }: BuildListFilters,
	{
		abilityPointsAtLeast,
		onBuild,
		updatedAt,
	}: {
		abilityPointsAtLeast: (ability: Ability, ap: number) => Expression<SqlBool>;
		/** Applies a condition on the build's `Build` row. */
		onBuild: (condition: Expression<SqlBool>) => Expression<SqlBool>;
		updatedAt: "Build.updatedAt" | "BuildWeapon.updatedAt";
	},
): Array<Expression<SqlBool>> {
	return [
		...abilities.map((filter) =>
			abilityFilterCondition(filter, abilityPointsAtLeast),
		),
		...(mode !== null
			? [
					// a quoted two letter code can't match inside another, and a substring search is far cheaper than `json_each`
					onBuild(
						sql<SqlBool>`instr("Build"."modes", ${JSON.stringify(mode)}) > 0`,
					),
				]
			: []),
		...(date !== null
			? [
					sql<SqlBool>`${sql.ref(updatedAt)} > ${dateToDatabaseTimestamp(new Date(date))}`,
				]
			: []),
	];
}

function toTimestamp(date: string) {
	return dateToDatabaseTimestamp(new Date(date));
}

function abilityFilterCondition(
	filter: AbilityFilter,
	abilityPointsAtLeast: (ability: Ability, ap: number) => Expression<SqlBool>,
): Expression<SqlBool> {
	switch (filter.type) {
		case "HAS":
			return abilityPointsAtLeast(filter.ability, 1);
		case "HAS_NOT":
			return sql<SqlBool>`not (${abilityPointsAtLeast(filter.ability, 1)})`;
		case "AT_LEAST":
			return abilityPointsAtLeast(filter.ability, filter.ap);
		case "AT_MOST":
			return sql<SqlBool>`not (${abilityPointsAtLeast(filter.ability, filter.ap + 1)})`;
		default:
			assertUnreachable(filter);
	}
}

function userBuildSortKeys(
	sort: BuildSort,
	weaponPool: MainWeaponId[],
): Array<Pagination.SortKey<"Build">> {
	switch (sort) {
		case "UPDATED_AT":
			return [["Build.updatedAt", "desc"]];
		case "ALPHABETICAL_TITLE":
			return [[sql`"Build"."title" collate nocase`, "asc"]];
		case "WEAPON_IN_GAME_ORDER":
			return [
				[
					sql`(select min("weaponSplId") from "BuildWeapon" where "buildId" = "Build"."id")`,
					"asc",
				],
			];
		case "WEAPON_POOL":
			return nullsLast(weaponPoolIndex(weaponPool));
		case "MODE":
			return nullsLast(
				sql`(select min(case "value" ${sql.join(
					modesShort.map((mode, i) => sql`when ${mode} then ${i}`),
					sql` `,
				)} end) from json_each("Build"."modes"))`,
			);
		case "TOP_500":
			return [
				[
					sql`exists (select 1 from "BuildWeapon" where "buildId" = "Build"."id" and "sortValue" % 2 = 0)`,
					"desc",
				],
			];
		case "HEADGEAR_ID":
			return nullsLast(sql.ref("Build.headGearSplId"));
		case "CLOTHES_ID":
			return nullsLast(sql.ref("Build.clothesGearSplId"));
		case "SHOES_ID":
			return nullsLast(sql.ref("Build.shoesGearSplId"));
		case "PUBLIC_BUILD":
			return [["Build.isPrivate", "asc"]];
		case "PRIVATE_BUILD":
			return [["Build.isPrivate", "desc"]];
		default:
			assertUnreachable(sort);
	}
}

/** Index in the pool of the build's first weapon there, kits of the same base weapon counting as one. */
function weaponPoolIndex(weaponPool: MainWeaponId[]) {
	const poolIndexByBaseWeaponId = new Map<MainWeaponId, number>();
	for (const [i, weaponId] of weaponPool.entries()) {
		const baseWeaponId = weaponIdToBaseWeaponId(weaponId);
		if (!poolIndexByBaseWeaponId.has(baseWeaponId)) {
			poolIndexByBaseWeaponId.set(baseWeaponId, i);
		}
	}

	if (poolIndexByBaseWeaponId.size === 0) return sql`null`;

	return sql`(select min(case "weaponSplId" - "weaponSplId" % 10 ${sql.join(
		[...poolIndexByBaseWeaponId].map(
			([baseWeaponId, i]) => sql`when ${baseWeaponId} then ${i}`,
		),
		sql` `,
	)} end) from "BuildWeapon" where "buildId" = "Build"."id")`;
}

function nullsLast(
	expression: Expression<unknown>,
): Array<Pagination.SortKey<"Build">> {
	return [
		[sql`${expression} is null`, "asc"],
		[expression, "asc"],
	];
}

/** The page's owners in the order their best ranked build comes, how many owners there are in all and, when filtered, how many builds. */
async function findOwnersPage({
	query,
	page,
	isFiltered,
}: {
	query: SelectQueryBuilder<DB, "BuildWeapon", Record<never, never>>;
	page: number;
	isFiltered: boolean;
}) {
	const pageStart = (page - 1) * BUILDS_PAGE_SIZE;
	const pageEnd = page * BUILDS_PAGE_SIZE;

	// checking the filters is most of a row's cost, so the matching rows are read once and the owners counted off them
	if (isFiltered) {
		const rows = await bestRankedFirst(
			query.select("BuildWeapon.ownerId"),
		).execute();
		const ownerIds = R.unique(rows.map((row) => row.ownerId));

		return {
			ownerIds: ownerIds.slice(pageStart, pageEnd),
			ownerCount: ownerIds.length,
			buildCount: rows.length,
		};
	}

	// both index only reads, the ranked one fetched in growing batches until the page's owners have shown up
	const rankedOwnerIds = bestRankedFirst(query.select("BuildWeapon.ownerId"));
	let ownerIds: number[] = [];
	for (let limit = pageEnd * 2; ; limit *= 2) {
		const rows = await rankedOwnerIds.limit(limit).execute();
		ownerIds = R.unique(rows.map((row) => row.ownerId));

		if (ownerIds.length >= pageEnd || rows.length < limit) break;
	}

	const { ownerCount } = await query
		.select(({ fn }) =>
			fn.count<number>("BuildWeapon.ownerId").distinct().as("ownerCount"),
		)
		.executeTakeFirstOrThrow();

	return {
		ownerIds: ownerIds.slice(pageStart, pageEnd),
		ownerCount,
		buildCount: null,
	};
}

/** Matches the `build_weapon_lookup` index. */
function bestRankedFirst<O>(query: SelectQueryBuilder<DB, "BuildWeapon", O>) {
	return query
		.orderBy("BuildWeapon.sortValue", "asc")
		.orderBy("BuildWeapon.updatedAt", "desc")
		.orderBy("BuildWeapon.buildId", "asc");
}

function buildRowsByIds(ids: number[]) {
	return db
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
		.where("Build.id", "in", ids);
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
			isTop500: toDBBoolean(weaponIsTop500(w.sortValue)),
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
				ownerId: args.ownerId,
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

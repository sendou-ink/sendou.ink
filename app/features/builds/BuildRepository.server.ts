import type { ExpressionBuilder, Transaction } from "kysely";
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import type { BuildWeapon, DB, Tables, TablesInsertable } from "~/db/tables";
import { modesShort } from "~/modules/in-game-lists/modes";
import type {
	Ability,
	BuildAbilitiesTuple,
	MainWeaponId,
	ModeShort,
} from "~/modules/in-game-lists/types";
import { weaponIdToArrayWithAlts } from "~/modules/in-game-lists/weapon-ids";
import invariant from "~/utils/invariant";
import { COMMON_USER_FIELDS } from "~/utils/kysely.server";
import { sortAbilities } from "./core/ability-sorting.server";

export async function allByUserId(
	userId: number,
	options: {
		showPrivate?: boolean;
		sortAbilities?: boolean;
	} = {},
) {
	const { showPrivate = false, sortAbilities: shouldSortAbilities = false } =
		options;
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
			jsonArrayFrom(
				eb
					.selectFrom("BuildWeapon")
					.select(["BuildWeapon.weaponSplId", "BuildWeapon.isTop500"])
					.orderBy("BuildWeapon.weaponSplId", "asc")
					.whereRef("BuildWeapon.buildId", "=", "Build.id"),
			).as("weapons"),
			withAbilities(eb),
		])
		.where("Build.ownerId", "=", userId)
		.$if(!showPrivate, (qb) => qb.where("Build.private", "=", 0))
		.execute();

	return rows.map((row) => {
		const abilities = dbAbilitiesToArrayOfArrays(row.abilities);

		return {
			...row,
			abilities: shouldSortAbilities ? sortAbilities(abilities) : abilities,
		};
	});
}

const gearOrder: Array<Tables["BuildAbility"]["gearType"]> = [
	"HEAD",
	"CLOTHES",
	"SHOES",
];
function dbAbilitiesToArrayOfArrays(
	abilities: Array<
		Pick<Tables["BuildAbility"], "ability" | "gearType" | "slotIndex">
	>,
): BuildAbilitiesTuple {
	const sorted = abilities
		.slice()
		.sort((a, b) => {
			if (a.gearType === b.gearType) return a.slotIndex - b.slotIndex;

			return gearOrder.indexOf(a.gearType) - gearOrder.indexOf(b.gearType);
		})
		.map((a) => a.ability);

	invariant(sorted.length === 12, "expected 12 abilities");

	return [
		[sorted[0], sorted[1], sorted[2], sorted[3]],
		[sorted[4], sorted[5], sorted[6], sorted[7]],
		[sorted[8], sorted[9], sorted[10], sorted[11]],
	];
}

interface CreateArgs {
	ownerId: TablesInsertable["Build"]["ownerId"];
	title: TablesInsertable["Build"]["title"];
	description: TablesInsertable["Build"]["description"];
	modes: Array<ModeShort> | null;
	headGearSplId: TablesInsertable["Build"]["headGearSplId"];
	clothesGearSplId: TablesInsertable["Build"]["clothesGearSplId"];
	shoesGearSplId: TablesInsertable["Build"]["shoesGearSplId"];
	weaponSplIds: Array<BuildWeapon["weaponSplId"]>;
	abilities: BuildAbilitiesTuple;
	private: TablesInsertable["Build"]["private"];
}

async function createInTrx({
	args,
	trx,
}: {
	args: CreateArgs;
	trx: Transaction<DB>;
}) {
	const { id: buildId, updatedAt } = await trx
		.insertInto("Build")
		.values({
			ownerId: args.ownerId,
			title: args.title,
			description: args.description,
			modes:
				args.modes && args.modes.length > 0
					? JSON.stringify(
							args.modes
								.slice()
								.sort((a, b) => modesShort.indexOf(a) - modesShort.indexOf(b)),
						)
					: null,
			headGearSplId: args.headGearSplId,
			clothesGearSplId: args.clothesGearSplId,
			shoesGearSplId: args.shoesGearSplId,
			private: args.private,
		})
		.returningAll()
		.executeTakeFirstOrThrow();

	await trx
		.insertInto("BuildWeapon")
		.values(
			args.weaponSplIds.map((weaponSplId) => ({
				buildId,
				weaponSplId,
			})),
		)
		.execute();

	await trx
		.updateTable("BuildWeapon")
		.set({ isTop500: 1 })
		.where("buildId", "=", buildId)
		.where(hasXRankPlacement)
		.execute();

	const tier =
		(
			await trx
				.selectFrom("PlusTier")
				.select("tier")
				.where("userId", "=", args.ownerId)
				.executeTakeFirst()
		)?.tier ?? 4;

	await trx
		.updateTable("BuildWeapon")
		.set({
			tier,
			updatedAt,
		})
		.where("buildId", "=", buildId)
		.execute();

	await trx
		.insertInto("BuildAbility")
		.values(
			args.abilities.flatMap((row, rowI) =>
				row.map((ability, abilityI) => ({
					buildId,
					gearType: rowI === 0 ? "HEAD" : rowI === 1 ? "CLOTHES" : "SHOES",
					ability,
					slotIndex: abilityI,
				})),
			),
		)
		.execute();
}

export async function create(args: CreateArgs) {
	return db.transaction().execute(async (trx) => createInTrx({ args, trx }));
}

export async function update(args: CreateArgs & { id: number }) {
	return db.transaction().execute(async (trx) => {
		await trx.deleteFrom("Build").where("id", "=", args.id).execute();
		await createInTrx({ args, trx });
	});
}

export function deleteById(id: number) {
	return db.deleteFrom("Build").where("id", "=", id).execute();
}

export async function abilityPointAverages(weaponSplId?: MainWeaponId | null) {
	return db
		.selectFrom("BuildAbility")
		.select(({ fn }) => [
			"BuildAbility.ability",
			fn.sum<number>("BuildAbility.abilityPoints").as("abilityPointsSum"),
		])
		.innerJoin("Build", "Build.id", "BuildAbility.buildId")
		.$if(typeof weaponSplId === "number", (qb) =>
			qb
				.innerJoin("BuildWeapon", "BuildAbility.buildId", "BuildWeapon.buildId")
				.where("BuildWeapon.weaponSplId", "=", weaponSplId!),
		)
		.groupBy("BuildAbility.ability")
		.where("Build.private", "=", 0)
		.execute();
}

export async function popularAbilitiesByWeaponId(weaponSplId: MainWeaponId) {
	const result = await db
		.selectFrom("BuildWeapon")
		.innerJoin("Build", "Build.id", "BuildWeapon.buildId")
		.select((eb) => [
			jsonArrayFrom(
				eb
					.selectFrom("BuildAbility")
					.select(["BuildAbility.ability", "BuildAbility.abilityPoints"])
					.whereRef("BuildAbility.buildId", "=", "BuildWeapon.buildId"),
			).as("abilities"),
		])
		.where("BuildWeapon.weaponSplId", "=", weaponSplId)
		.where("Build.private", "=", 0)
		.groupBy("Build.ownerId") // consider only one build per user
		.execute();

	return result as Array<{
		abilities: Array<{
			ability: Ability;
			abilityPoints: number;
		}>;
	}>;
}

export type AverageAbilityPointsResult = Awaited<
	ReturnType<typeof abilityPointAverages>
>[number];

export type AbilitiesByWeapon = Awaited<
	ReturnType<typeof popularAbilitiesByWeaponId>
>[number];

export async function allByWeaponId(
	weaponId: MainWeaponId,
	options: { limit: number; sortAbilities?: boolean },
) {
	const { limit, sortAbilities: shouldSortAbilities = false } = options;
	const weaponIds = weaponIdToArrayWithAlts(weaponId);

	let rows: Awaited<ReturnType<typeof buildsByWeaponIdQuery>>;

	if (weaponIds.length === 1) {
		rows = await buildsByWeaponIdQuery(weaponIds[0], limit);
	} else {
		// For weapons with alts, run separate queries and merge.
		// This allows each query to use the covering index for ordering,
		// which is ~6x faster than using IN with multiple values.
		const allResults = await Promise.all(
			weaponIds.map((id) => buildsByWeaponIdQuery(id, limit)),
		);

		const seenBuildIds = new Set<number>();
		type BuildRow = Awaited<ReturnType<typeof buildsByWeaponIdQuery>>[number];
		const merged: BuildRow[] = [];

		// Merge results maintaining sort order (tier asc, isTop500 desc, updatedAt desc)
		// Since each query returns sorted results, we can interleave them
		const pointers = allResults.map(() => 0);

		while (merged.length < limit) {
			let bestIdx = -1;
			let bestRow: BuildRow | null = null;

			for (let i = 0; i < allResults.length; i++) {
				while (
					pointers[i] < allResults[i].length &&
					seenBuildIds.has(allResults[i][pointers[i]].id)
				) {
					pointers[i]++;
				}

				if (pointers[i] >= allResults[i].length) continue;

				const row = allResults[i][pointers[i]];

				if (
					!bestRow ||
					row.bwTier < bestRow.bwTier ||
					(row.bwTier === bestRow.bwTier &&
						row.bwIsTop500 > bestRow.bwIsTop500) ||
					(row.bwTier === bestRow.bwTier &&
						row.bwIsTop500 === bestRow.bwIsTop500 &&
						row.bwUpdatedAt > bestRow.bwUpdatedAt)
				) {
					bestIdx = i;
					bestRow = row;
				}
			}

			if (bestIdx === -1 || !bestRow) break;

			seenBuildIds.add(bestRow.id);
			merged.push(bestRow);
			pointers[bestIdx]++;
		}

		rows = merged;
	}

	return rows.map((row) => {
		const abilities = dbAbilitiesToArrayOfArrays(row.abilities);

		return {
			...row,
			abilities: shouldSortAbilities ? sortAbilities(abilities) : abilities,
		};
	});
}

function buildsByWeaponIdQuery(weaponSplId: MainWeaponId, limit: number) {
	return db
		.selectFrom("BuildWeapon")
		.innerJoin("Build", "Build.id", "BuildWeapon.buildId")
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
			"PlusTier.tier as plusTier",
			"BuildWeapon.tier as bwTier",
			"BuildWeapon.isTop500 as bwIsTop500",
			"BuildWeapon.updatedAt as bwUpdatedAt",
			withAbilities(eb),
			jsonArrayFrom(
				eb
					.selectFrom("BuildWeapon as BuildWeaponInner")
					.select(["BuildWeaponInner.weaponSplId", "BuildWeaponInner.isTop500"])
					.orderBy("BuildWeaponInner.weaponSplId", "asc")
					.whereRef("BuildWeaponInner.buildId", "=", "Build.id"),
			).as("weapons"),
			jsonObjectFrom(
				eb
					.selectFrom("User")
					.select([...COMMON_USER_FIELDS])
					.whereRef("User.id", "=", "Build.ownerId"),
			).as("owner"),
		])
		.where("Build.private", "=", 0)
		.where("BuildWeapon.weaponSplId", "=", weaponSplId)
		.orderBy("BuildWeapon.tier", "asc")
		.orderBy("BuildWeapon.isTop500", "desc")
		.orderBy("BuildWeapon.updatedAt", "desc")
		.limit(limit)
		.execute();
}

function withAbilities(eb: ExpressionBuilder<DB, "Build">) {
	return jsonArrayFrom(
		eb
			.selectFrom("BuildAbility")
			.select([
				"BuildAbility.gearType",
				"BuildAbility.ability",
				"BuildAbility.slotIndex",
			])
			.whereRef("BuildAbility.buildId", "=", "Build.id"),
	).as("abilities");
}

function hasXRankPlacement(eb: ExpressionBuilder<DB, "BuildWeapon">) {
	return eb.exists(
		eb
			.selectFrom("Build")
			.select("BuildWeapon.buildId")
			.leftJoin("SplatoonPlayer", "SplatoonPlayer.userId", "Build.ownerId")
			.leftJoin(
				"XRankPlacement",
				"XRankPlacement.playerId",
				"SplatoonPlayer.id",
			)
			.whereRef("Build.id", "=", "BuildWeapon.buildId")
			.whereRef("XRankPlacement.weaponSplId", "=", "BuildWeapon.weaponSplId"),
	);
}

/** Recalculates which build weapons are top 500 based on latest X Rank placements data. */
export async function recalculateAllTop500() {
	await db.transaction().execute(async (trx) => {
		await trx.updateTable("BuildWeapon").set({ isTop500: 0 }).execute();

		await trx
			.updateTable("BuildWeapon")
			.set({ isTop500: 1 })
			.where(hasXRankPlacement)
			.execute();
	});
}

export async function recalculateAllTiers() {
	await db.transaction().execute(async (trx) => {
		await trx
			.updateTable("BuildWeapon")
			.set({
				tier: 4,
			})
			.execute();

		for (const tier of [3, 2, 1]) {
			const tierMembers = (
				await trx
					.selectFrom("PlusTier")
					.select("userId")
					.where("tier", "=", tier)
					.execute()
			).map((r) => r.userId);

			await trx
				.updateTable("BuildWeapon")
				.set({ tier })
				.where("BuildWeapon.buildId", "in", (eb) =>
					eb
						.selectFrom("Build")
						.select("Build.id")
						.where("Build.ownerId", "in", tierMembers),
				)
				.execute();
		}
	});
}

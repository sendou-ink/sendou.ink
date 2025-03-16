import type { Transaction } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import type { BuildWeapon, DB, Tables, TablesInsertable } from "~/db/tables";
import {
	type BuildAbilitiesTuple,
	type ModeShort,
	modesShort,
} from "~/modules/in-game-lists";
import invariant from "~/utils/invariant";

export async function allByUserId({
	userId,
	showPrivate,
}: {
	userId: number;
	showPrivate: boolean;
}) {
	const rows = await db
		.with("Top500Weapon", (db) =>
			db
				.selectFrom("Build")
				.innerJoin("BuildWeapon", "Build.id", "BuildWeapon.buildId")
				.leftJoin("SplatoonPlayer", (join) =>
					join.on("SplatoonPlayer.userId", "=", userId),
				)
				.leftJoin("XRankPlacement", (join) =>
					join
						.onRef("XRankPlacement.playerId", "=", "SplatoonPlayer.id")
						.onRef(
							"XRankPlacement.weaponSplId",
							"=",
							"BuildWeapon.weaponSplId",
						),
				)
				.select(({ fn }) => [
					"BuildWeapon.buildId",
					"BuildWeapon.weaponSplId",
					fn.min("XRankPlacement.rank").as("minRank"),
					fn.max("XRankPlacement.power").as("maxPower"),
				])
				.where("Build.ownerId", "=", userId)
				.groupBy(["BuildWeapon.buildId", "BuildWeapon.weaponSplId"]),
		)
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
					.selectFrom("Top500Weapon")
					.select([
						"Top500Weapon.weaponSplId",
						"Top500Weapon.maxPower",
						"Top500Weapon.minRank",
					])
					.orderBy("Top500Weapon.weaponSplId", "asc")
					.whereRef("Top500Weapon.buildId", "=", "Build.id"),
			).as("weapons"),
			jsonArrayFrom(
				eb
					.selectFrom("BuildAbility")
					.select([
						"BuildAbility.gearType",
						"BuildAbility.ability",
						"BuildAbility.slotIndex",
					])
					.whereRef("BuildAbility.buildId", "=", "Build.id"),
			).as("abilities"),
		])
		.where("Build.ownerId", "=", userId)
		.$if(!showPrivate, (qb) => qb.where("Build.private", "=", 0))
		.execute();

	return rows.map((row) => ({
		...row,
		abilities: dbAbilitiesToArrayOfArrays(row.abilities),
	}));
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

export async function countByUserId({
	userId,
	showPrivate,
}: {
	userId: number;
	showPrivate: boolean;
}) {
	return (
		await db
			.selectFrom("Build")
			.select(({ fn }) => fn.countAll<number>().as("count"))
			.where("ownerId", "=", userId)
			.$if(!showPrivate, (qb) => qb.where("Build.private", "=", 0))
			.executeTakeFirstOrThrow()
	).count;
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

export async function createInTrx({
	args,
	trx,
}: {
	args: CreateArgs;
	trx: Transaction<DB>;
}) {
	const { id: buildId } = await trx
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
		.returning("id")
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

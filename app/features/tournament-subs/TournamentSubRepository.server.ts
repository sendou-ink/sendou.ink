import { sql } from "kysely";
import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";
import type { MainWeaponId } from "~/modules/in-game-lists/types";

export async function findSubsVisibleToUser({
	tournamentId,
	userId,
}: {
	tournamentId: number;
	userId?: number;
}) {
	const userPlusTier = await getUserPlusTier(userId);

	const rows = await baseQuery(tournamentId)
		.where((eb) =>
			eb.or([
				eb("TournamentSub.visibility", "=", "ALL"),
				eb.and([
					eb("TournamentSub.visibility", "=", "+1"),
					eb(sql`${userPlusTier}`, "=", 1),
				]),
				eb.and([
					eb("TournamentSub.visibility", "=", "+2"),
					eb(sql`${userPlusTier}`, "<=", 2),
				]),
				eb.and([
					eb("TournamentSub.visibility", "=", "+3"),
					eb(sql`${userPlusTier}`, "<=", 3),
				]),
			]),
		)
		.orderBy((eb) =>
			eb
				.case()
				.when("TournamentSub.userId", "=", userId ?? null)
				.then(0)
				.else(1)
				.end(),
		)
		.orderBy((eb) =>
			eb
				.case()
				.when(eb("PlusTier.tier", "is", null))
				.then(4)
				.else(eb.ref("PlusTier.tier"))
				.end(),
		)
		.orderBy("TournamentSub.createdAt", "desc")
		.execute();

	return mapRows(rows);
}

export async function findUserSubPost({
	tournamentId,
	userId,
}: {
	tournamentId: number;
	userId: number;
}) {
	const row = await baseQuery(tournamentId)
		.where("TournamentSub.userId", "=", userId)
		.executeTakeFirst();

	if (!row) return null;

	return mapRows([row])[0];
}

export function upsert(
	args: Omit<TablesInsertable["TournamentSub"], "bestWeapons" | "okWeapons"> & {
		bestWeapons: MainWeaponId[];
		okWeapons: MainWeaponId[];
	},
) {
	return db.transaction().execute(async (trx) => {
		const bestWeaponsStr = args.bestWeapons.join(",");
		const okWeaponsStr =
			args.okWeapons.length > 0 ? args.okWeapons.join(",") : null;

		await trx
			.insertInto("TournamentSub")
			.values({
				userId: args.userId,
				tournamentId: args.tournamentId,
				canVc: args.canVc,
				bestWeapons: bestWeaponsStr,
				okWeapons: okWeaponsStr,
				message: args.message,
				visibility: args.visibility,
			})
			.onConflict((oc) =>
				oc.columns(["userId", "tournamentId"]).doUpdateSet({
					canVc: args.canVc,
					bestWeapons: bestWeaponsStr,
					okWeapons: okWeaponsStr,
					message: args.message,
					visibility: args.visibility,
				}),
			)
			.execute();

		await trx
			.updateTable("User")
			.set({ lastSubMessage: args.message })
			.where("id", "=", args.userId)
			.execute();
	});
}

async function getUserPlusTier(userId?: number) {
	if (!userId) return 4;

	const row = await db
		.selectFrom("PlusTier")
		.select("tier")
		.where("userId", "=", userId)
		.executeTakeFirst();

	return row?.tier ?? 4;
}

function baseQuery(tournamentId: number) {
	return db
		.selectFrom("TournamentSub")
		.innerJoin("User", "User.id", "TournamentSub.userId")
		.leftJoin("PlusTier", "PlusTier.userId", "User.id")
		.select([
			"TournamentSub.canVc",
			"TournamentSub.bestWeapons",
			"TournamentSub.okWeapons",
			"TournamentSub.message",
			"TournamentSub.visibility",
			"TournamentSub.createdAt",
			"TournamentSub.userId",
			"User.username",
			"User.discordAvatar",
			"User.country",
			"User.discordId",
			"User.customUrl",
			"PlusTier.tier as plusTier",
		])
		.where("TournamentSub.tournamentId", "=", tournamentId);
}

function mapRows<
	T extends {
		bestWeapons: string;
		okWeapons: string | null;
	},
>(rows: T[]) {
	return rows.map((row) => ({
		...row,
		bestWeapons: parseWeaponsArray(row.bestWeapons)!,
		okWeapons: parseWeaponsArray(row.okWeapons),
	}));
}

function parseWeaponsArray(value: string | null) {
	if (!value) return null;

	return value.split(",").map(Number) as MainWeaponId[];
}

import { db } from "~/db/sql";

export async function all() {
	return db.selectFrom("Trophy").select(["id", "name", "model"]).execute();
}

export async function findById(trophyId: number) {
	const row = await db
		.selectFrom("Trophy")
		.select(["id", "name", "model"])
		.where("id", "=", trophyId)
		.executeTakeFirst();

	return row ?? null;
}

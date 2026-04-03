import { db } from "~/db/sql";

export async function all() {
	return db.selectFrom("Trophy").select(["id", "name", "model"]).execute();
}

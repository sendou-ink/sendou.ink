import { db } from "~/db/sql";

export function deleteById(id: number) {
	return db.deleteFrom("UnvalidatedVideo").where("id", "=", id).execute();
}

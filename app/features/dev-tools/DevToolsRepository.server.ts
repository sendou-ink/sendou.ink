import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import { commonUserSelect } from "~/utils/kysely.server";

export function findAllUsersByIds(ids: Array<Tables["User"]["id"]>) {
	return db
		.selectFrom("User")
		.select((eb) => commonUserSelect(eb))
		.where("User.id", "in", ids)
		.execute();
}

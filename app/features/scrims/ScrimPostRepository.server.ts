import { nanoid } from "nanoid";
import { INVITE_CODE_LENGTH } from "../../constants";
import { db } from "../../db/sql";
import { databaseTimestampNow } from "../../utils/dates";

export function insert() {
	return db.transaction().execute(async (trx) => {
		await trx
			.insertInto("ScrimPost")
			.values({
				at: databaseTimestampNow(),
				authorId: 1,
				chatCode: nanoid(INVITE_CODE_LENGTH),
				maxDiv: 1,
				minDiv: 2,
				teamId: 1,
				text: "helloo",
				visibility: 1,
			})
			.execute();
	});
}

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function up(db) {
	const dir = dirname(fileURLToPath(import.meta.url));
	const jsonPath = resolve(dir, "../scripts/join-order.json");
	const mapping = JSON.parse(readFileSync(jsonPath, "utf-8"));

	db.transaction(() => {
		db.prepare(/* sql */ `alter table "User" add "joinOrder" integer`).run();

		const stmt = db.prepare(
			/* sql */ `update "User" set "joinOrder" = ? where "id" = ?`,
		);
		for (const [sqliteId, joinOrder] of Object.entries(mapping)) {
			stmt.run(joinOrder, Number(sqliteId));
		}

		const maxJoinOrder = db
			.prepare(/* sql */ `select max("joinOrder") as m from "User"`)
			.get().m;

		const unmapped = db
			.prepare(
				/* sql */ `select "id" from "User" where "joinOrder" is null order by "id" asc`,
			)
			.all();

		for (let i = 0; i < unmapped.length; i++) {
			stmt.run(maxJoinOrder + 1 + i, unmapped[i].id);
		}
	})();
}

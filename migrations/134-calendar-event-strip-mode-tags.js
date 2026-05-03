export function up(db) {
	db.transaction(() => {
		const rows = db
			.prepare(
				/* sql */ `select "id", "tags" from "CalendarEvent" where "tags" is not null`,
			)
			.all();

		const stmt = db.prepare(
			/* sql */ `update "CalendarEvent" set "tags" = ? where "id" = ?`,
		);

		for (const row of rows) {
			const cleaned = row.tags
				.split(",")
				.filter((tag) => tag !== "SZ" && tag !== "TW")
				.join(",");
			const newTags = cleaned === "" ? null : cleaned;

			if (newTags !== row.tags) {
				stmt.run(newTags, row.id);
			}
		}
	})();
}

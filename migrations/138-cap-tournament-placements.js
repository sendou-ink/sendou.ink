const PLACEMENT_MAX = 100;

export function up(db) {
	const rows = db
		.prepare(/* sql */ `select "id", "settings" from "Tournament"`)
		.all();

	const updates = [];
	for (const row of rows) {
		const settings = JSON.parse(row.settings);
		const progression = settings.bracketProgression;
		if (!Array.isArray(progression)) continue;

		let changed = false;
		for (const bracket of progression) {
			for (const source of bracket.sources ?? []) {
				if (!Array.isArray(source.placements)) continue;
				const filtered = source.placements.filter((p) => p <= PLACEMENT_MAX);
				if (filtered.length !== source.placements.length) {
					source.placements = filtered;
					changed = true;
				}
			}
		}

		if (changed) {
			updates.push({ id: row.id, settings: JSON.stringify(settings) });
		}
	}

	const update = db.prepare(
		/* sql */ `update "Tournament" set "settings" = ? where "id" = ?`,
	);

	for (const u of updates) {
		update.run(u.settings, u.id);
	}
}

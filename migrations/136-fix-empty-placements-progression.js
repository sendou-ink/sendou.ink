const TOURNAMENT_ID = 1078;

export function up(db) {
	const row = db
		.prepare(/* sql */ `select "settings" from "Tournament" where "id" = ?`)
		.get(TOURNAMENT_ID);

	if (!row) return;

	const settings = JSON.parse(row.settings);
	const source = settings.bracketProgression?.[1]?.sources?.[0];
	if (!source || source.placements?.length !== 0) return;

	source.placements = [-1];

	db.prepare(
		/* sql */ `update "Tournament" set "settings" = ? where "id" = ?`,
	).run(JSON.stringify(settings), TOURNAMENT_ID);
}

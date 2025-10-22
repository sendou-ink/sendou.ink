export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "ScrimPostRequest" add "message" text`,
		).run();
		db.prepare(
			/* sql */ `alter table "ScrimPost" add "rangeEnd" integer`,
		).run();
		db.prepare(
			/* sql */ `alter table "ScrimPostRequest" add "at" integer`,
		).run();
		db.prepare(/* sql */ `alter table "ScrimPost" add "maps" text`).run();
		db.prepare(
			/* sql */ `alter table "ScrimPost" add "mapsTournamentId" integer references "Tournament"("id") on delete cascade`,
		).run();
		db.prepare(
			/* sql */ `create index "scrim_post_maps_tournament_id" on "ScrimPost"("mapsTournamentId")`,
		).run();
	})();
}

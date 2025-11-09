export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "TournamentOrganization" add "isEstablished" integer not null default 0`,
		).run();
		db.prepare(/* sql */ `update "User" set "isTournamentOrganizer" = 0`).run();
	})();
}

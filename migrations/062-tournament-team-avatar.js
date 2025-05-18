export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "TournamentTeam" add "avatarImgId" integer`,
		).run();
	})();
}

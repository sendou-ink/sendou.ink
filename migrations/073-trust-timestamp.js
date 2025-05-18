export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "TrustRelationship" add "lastUsedAt" integer default 0`,
		).run();

		db.prepare(
			/* sql */ `update "TrustRelationship" set "lastUsedAt" = strftime('%s', 'now')`,
		).run();
	})();
}

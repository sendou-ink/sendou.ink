export function up(db) {
	db.transaction(() => {
		// there was a bug in the past where createdAt was set when account was updated instead
		db.prepare(/* sql */ `update "User" set "createdAt" = null`).run();
	})();
}

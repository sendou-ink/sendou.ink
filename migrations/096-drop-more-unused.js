export function up(db) {
	db.transaction(() => {
		db.prepare(/* sql */`alter table "Badge" drop column "hue"`).run();

		// xxx: add index to buildweapon weaponsplid
	})();
}

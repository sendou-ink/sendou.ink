export function up(db) {
	db.transaction(() => {
		db.prepare(/* sql */ `drop table if exists "RoomLink"`).run();

		db.prepare(/* sql */ `alter table "User" drop column "noSplatnet"`).run();

		db.pragma("foreign_key_check");
	})();
}

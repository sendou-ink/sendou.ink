export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
				create table "ExternalStream" (
					"id" integer primary key autoincrement,
					"name" text not null,
					"url" text not null,
					"avatarImgId" integer,
					"startTime" integer not null,
					"createdAt" integer default (strftime('%s', 'now')) not null,
					foreign key ("avatarImgId") references "UnvalidatedUserSubmittedImage"("id") on delete set null
				) strict
			`,
		).run();

		db.pragma("foreign_key_check");
	})();
}

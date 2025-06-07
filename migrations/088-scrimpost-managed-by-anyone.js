export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "ScrimPost" add column "managedByAnyone" integer default 0 not null`,
		).run();
		db.prepare(
			/* sql */ `alter table "ScrimPost" add column "canceledAt" integer`,
		).run();
		db.prepare(
			/* sql */ `alter table "ScrimPost" add column "canceledByUserId" integer references "User"("id") on delete restrict`,
		).run();
		db.prepare(
			/* sql */ `alter table "ScrimPost" add column "cancelReason" text`,
		).run();
	})();
}

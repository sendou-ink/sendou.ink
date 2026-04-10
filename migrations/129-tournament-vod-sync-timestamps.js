export function up(db) {
	db.prepare(
		/* sql */ `alter table "Tournament" add column "vodsLastSyncAt" integer`,
	).run();
	db.prepare(
		/* sql */ `alter table "Tournament" add column "vodsSyncCount" integer not null default 0`,
	).run();
}

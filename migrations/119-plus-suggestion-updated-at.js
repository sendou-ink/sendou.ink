export function up(db) {
	db.prepare(
		/* sql */ `alter table "PlusSuggestion" add column "updatedAt" integer`,
	).run();
}

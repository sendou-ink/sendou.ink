export function up(db) {
	db.prepare(
		/* sql */ `create index group_match_reported_at on "GroupMatch"("reportedAt")`,
	).run();
}

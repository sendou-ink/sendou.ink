export function up(db) {
	db.prepare(
		/* sql */ `create index map_result_user_id_season ON "MapResult"("userId", "season")`,
	).run();

	db.prepare(
		/* sql */ `create index player_result_owner_user_id_season ON "PlayerResult"("ownerUserId", "season")`,
	).run();
}

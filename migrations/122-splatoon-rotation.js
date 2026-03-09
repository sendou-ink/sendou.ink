export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
      create table "SplatoonRotation" (
        "id" integer primary key,
        "type" text not null,
        "mode" text not null,
        "stageId1" integer not null,
        "stageId2" integer not null,
        "startTime" integer not null,
        "endTime" integer not null
      ) strict`,
		).run();
	})();
}

export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "ScrimPost" add column "trackingEnabledAt" integer`,
		).run();

		db.prepare(
			/* sql */ `alter table "ScrimPost" add column "trackingLockedAt" integer`,
		).run();

		db.prepare(
			/* sql */ `
				create table "ScrimMapList" (
					"id" integer primary key autoincrement,
					"scrimPostId" integer not null,
					"side" text not null check ("side" in ('ALPHA','BRAVO')),
					"source" text not null check ("source" in ('TOURNAMENT','POOL')),
					"tournamentId" integer,
					"serializedPool" text,
					"updatedAt" integer not null,
					foreign key ("scrimPostId") references "ScrimPost"("id") on delete cascade,
					foreign key ("tournamentId") references "Tournament"("id"),
					unique("scrimPostId", "side") on conflict rollback
				) strict
			`,
		).run();

		db.prepare(
			/* sql */ `
				create table "ScrimMap" (
					"id" integer primary key autoincrement,
					"scrimPostId" integer not null,
					"index" integer not null,
					"mode" text not null,
					"stageId" integer not null,
					"winnerSide" text check ("winnerSide" in ('ALPHA','BRAVO')),
					"reportedAt" integer,
					"reportedByUserId" integer,
					"replayOfIndex" integer,
					foreign key ("scrimPostId") references "ScrimPost"("id") on delete cascade,
					foreign key ("reportedByUserId") references "User"("id"),
					unique("scrimPostId", "index") on conflict rollback
				) strict
			`,
		).run();

		db.prepare(
			/* sql */ `create index scrim_map_scrim_post_id_index_idx on "ScrimMap"("scrimPostId", "index")`,
		).run();

		db.pragma("foreign_key_check");
	})();
}

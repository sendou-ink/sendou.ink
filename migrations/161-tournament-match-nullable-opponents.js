export function up(db) {
	db.pragma("foreign_keys = OFF");

	db.transaction(() => {
		db.prepare(
			/* sql */ `
				create table "TournamentMatch_new" (
					"id" integer primary key,
					"roundId" integer not null,
					"stageId" integer not null,
					"groupId" integer not null,
					"number" integer not null,
					"opponentOne" text,
					"opponentTwo" text,
					"winnerSide" text check ("winnerSide" in ('opponent1','opponent2')),
					"chatCode" text,
					"startedAt" integer,
					foreign key ("roundId") references "TournamentRound"("id") on delete cascade,
					foreign key ("stageId") references "TournamentStage"("id") on delete cascade,
					foreign key ("groupId") references "TournamentGroup"("id") on delete cascade,
					unique("number", "roundId") on conflict rollback
				) strict
			`,
		).run();

		db.prepare(
			/* sql */ `
				insert into "TournamentMatch_new" ("id", "roundId", "stageId", "groupId", "number", "opponentOne", "opponentTwo", "winnerSide", "chatCode", "startedAt")
				select
					"id",
					"roundId",
					"stageId",
					"groupId",
					"number",
					case when "opponentOne" = 'null' then null else json_remove("opponentOne", '$.result', '$.forfeit', '$.totalPoints', '$.totalKos') end,
					case when "opponentTwo" = 'null' then null else json_remove("opponentTwo", '$.result', '$.forfeit', '$.totalPoints', '$.totalKos') end,
					case
						when "opponentOne" ->> '$.result' = 'win' then 'opponent1'
						when "opponentTwo" ->> '$.result' = 'win' then 'opponent2'
					end,
					"chatCode",
					"startedAt"
				from "TournamentMatch"
			`,
		).run();

		db.prepare(/* sql */ `drop table "TournamentMatch"`).run();

		db.prepare(
			/* sql */ `alter table "TournamentMatch_new" rename to "TournamentMatch"`,
		).run();

		db.prepare(
			/* sql */ `create index tournament_match_round_id on "TournamentMatch"("roundId")`,
		).run();
		db.prepare(
			/* sql */ `create index tournament_match_stage_id on "TournamentMatch"("stageId")`,
		).run();
		db.prepare(
			/* sql */ `create index tournament_match_group_id on "TournamentMatch"("groupId")`,
		).run();
		db.prepare(
			/* sql */ `create index idx_tournament_match_opponent_one_id on "TournamentMatch"("opponentOne" ->> '$.id')`,
		).run();
		db.prepare(
			/* sql */ `create index idx_tournament_match_opponent_two_id on "TournamentMatch"("opponentTwo" ->> '$.id')`,
		).run();

		db.prepare(
			/* sql */ `alter table "TournamentMatchGameResult" add "ko" integer`,
		).run();

		db.prepare(
			/* sql */ `
				update "TournamentMatchGameResult"
				set "ko" = 1
				where ("opponentOnePoints" = 100 and "opponentTwoPoints" = 0)
					or ("opponentOnePoints" = 0 and "opponentTwoPoints" = 100)
			`,
		).run();

		db.prepare(
			/* sql */ `alter table "TournamentMatchGameResult" drop column "opponentOnePoints"`,
		).run();
		db.prepare(
			/* sql */ `alter table "TournamentMatchGameResult" drop column "opponentTwoPoints"`,
		).run();

		db.prepare(
			/* sql */ `
				update "TournamentStage"
				set "settings" = json_patch(
					json_remove("settings", '$.swiss'),
					json_object(
						'groupCount', "settings" ->> '$.swiss.groupCount',
						'roundCount', "settings" ->> '$.swiss.roundCount'
					)
				)
				where "settings" ->> '$.swiss' is not null
			`,
		).run();

		db.pragma("foreign_key_check");
	})();

	db.pragma("foreign_keys = ON");
}

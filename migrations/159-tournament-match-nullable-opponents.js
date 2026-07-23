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
					"status" integer not null,
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
				insert into "TournamentMatch_new" ("id", "roundId", "stageId", "groupId", "number", "opponentOne", "opponentTwo", "status", "chatCode", "startedAt")
				select
					"id",
					"roundId",
					"stageId",
					"groupId",
					"number",
					case when "opponentOne" = 'null' then null else "opponentOne" end,
					case when "opponentTwo" = 'null' then null else "opponentTwo" end,
					"status",
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
			/* sql */ `
				create trigger set_started_at_on_insert
				after insert on "TournamentMatch"
				for each row
				when json_extract(new."opponentOne", '$.id') is not null
					and json_extract(new."opponentTwo", '$.id') is not null
					and new."status" = 2
					and new."startedAt" is null
				begin
					update "TournamentMatch"
					set "startedAt" = (strftime('%s', 'now'))
					where "id" = new."id";
				end
			`,
		).run();
		db.prepare(
			/* sql */ `
				create trigger set_started_at_on_update
				after update on "TournamentMatch"
				for each row
				when new."startedAt" is null
					and json_extract(new."opponentOne", '$.id') is not null
					and json_extract(new."opponentTwo", '$.id') is not null
					and new."status" = 2
				begin
					update "TournamentMatch"
					set "startedAt" = (strftime('%s', 'now'))
					where "id" = new."id";
				end
			`,
		).run();
		db.prepare(
			/* sql */ `
				create trigger clear_started_at_on_update
				after update on "TournamentMatch"
				for each row
				when new."startedAt" is not null
					and (json_extract(new."opponentOne", '$.id') is null or json_extract(new."opponentTwo", '$.id') is null)
				begin
					update "TournamentMatch"
					set "startedAt" = null
					where "id" = new."id";
				end
			`,
		).run();

		db.pragma("foreign_key_check");
	})();

	db.pragma("foreign_keys = ON");
}

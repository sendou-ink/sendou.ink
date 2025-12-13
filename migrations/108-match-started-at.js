export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "TournamentMatch" add "startedAt" integer`,
		).run();

		db.prepare(
			/* sql */ `alter table "TournamentMatch" drop column "createdAt"`,
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

		// note: we are on purpose not handling the case where round robin match is reopened
		// this could be a future improvement
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
	})();
}

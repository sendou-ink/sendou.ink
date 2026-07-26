const NULLABLE_BOOLEAN_COLUMNS = [
	{ table: "GroupLike", column: "isRechallenge" },
	{ table: "User", column: "isArtist" },
	{ table: "User", column: "isVideoAdder" },
	{ table: "User", column: "isTournamentOrganizer" },
	{ table: "User", column: "isApiAccesser" },
	{ table: "User", column: "commissionsOpen" },
];

const COMMA_SEPARATED_STRING_COLUMNS = [
	{ table: "CalendarEvent", column: "tags" },
	{ table: "User", column: "languages" },
	{ table: "LFGPost", column: "languages" },
];

const COMMA_SEPARATED_NUMBER_COLUMNS = [
	{ table: "TournamentSub", column: "okWeapons" },
];

const RENAMED_TIMESTAMP_COLUMNS = [
	{ table: "CalendarEventDate", from: "startTime", to: "startsAt" },
	{ table: "ExternalStream", from: "startTime", to: "startsAt" },
	{ table: "SplatoonRotation", from: "startTime", to: "startsAt" },
	{ table: "SplatoonRotation", from: "endTime", to: "endsAt" },
	{ table: "ScrimPost", from: "at", to: "startsAt" },
	{ table: "ScrimPost", from: "rangeEnd", to: "rangeEndsAt" },
	{ table: "ScrimPostRequest", from: "at", to: "startsAt" },
	{ table: "PlusVote", from: "validAfter", to: "becomesValidAt" },
	{ table: "UnvalidatedVideo", from: "youtubeDate", to: "youtubePublishedAt" },
	{ table: "User", from: "patronSince", to: "patronStartedAt" },
	{ table: "User", from: "patronTill", to: "patronExpiresAt" },
];

export function up(db) {
	db.pragma("foreign_keys = OFF");

	db.transaction(() => {
		db.prepare(
			/*sql*/ `alter table "Build" add column "isPrivate" integer not null default 0`,
		).run();

		db.prepare(
			/*sql*/ `update "Build" set "isPrivate" = coalesce("private", 0)`,
		).run();

		db.prepare(/*sql*/ `alter table "Build" drop column "private"`).run();

		for (const { table, column } of NULLABLE_BOOLEAN_COLUMNS) {
			db.prepare(
				/*sql*/ `alter table "${table}" add column "${column}_new" integer not null default 0`,
			).run();

			db.prepare(
				/*sql*/ `update "${table}" set "${column}_new" = coalesce("${column}", 0)`,
			).run();

			db.prepare(
				/*sql*/ `alter table "${table}" drop column "${column}"`,
			).run();

			db.prepare(
				/*sql*/ `alter table "${table}" rename column "${column}_new" to "${column}"`,
			).run();
		}

		for (const { table, from, to } of RENAMED_TIMESTAMP_COLUMNS) {
			db.prepare(
				/*sql*/ `alter table "${table}" rename column "${from}" to "${to}"`,
			).run();
		}

		for (const { table, column } of COMMA_SEPARATED_STRING_COLUMNS) {
			db.prepare(
				/*sql*/ `update "${table}" set "${column}" = null where "${column}" = ''`,
			).run();

			db.prepare(
				/*sql*/ `
					update "${table}"
						set "${column}" = '["' || replace("${column}", ',', '","') || '"]'
						where "${column}" is not null
				`,
			).run();
		}

		for (const { table, column } of COMMA_SEPARATED_NUMBER_COLUMNS) {
			db.prepare(
				/*sql*/ `update "${table}" set "${column}" = null where "${column}" = ''`,
			).run();

			db.prepare(
				/*sql*/ `
					update "${table}"
						set "${column}" = '[' || "${column}" || ']'
						where "${column}" is not null
				`,
			).run();
		}

		db.prepare(
			/*sql*/ `
				update "TournamentSub"
					set "bestWeapons" = iif("bestWeapons" = '', '[]', '[' || "bestWeapons" || ']')
			`,
		).run();

		db.prepare(
			/*sql*/ "drop index calendar_event_date_event_id_start_time",
		).run();
		db.prepare(
			/*sql*/ `create index calendar_event_date_event_id_starts_at on "CalendarEventDate"("eventId", "startsAt" desc)`,
		).run();

		db.prepare(/*sql*/ "drop index scrim_post_at").run();
		db.prepare(
			/*sql*/ `create index scrim_post_starts_at on "ScrimPost"("startsAt")`,
		).run();

		db.prepare(
			/* sql */ `
				create table "TournamentAuditLog_new" (
					"id" integer primary key autoincrement,
					"tournamentId" integer not null,
					"type" text not null,
					"actorUserId" integer not null,
					"subjectUserId" integer,
					"tournamentTeamHistoryId" integer,
					"metadata" text,
					"createdAt" integer default (strftime('%s', 'now')) not null,
					foreign key ("tournamentId") references "Tournament"("id") on delete cascade,
					foreign key ("actorUserId") references "User"("id"),
					foreign key ("subjectUserId") references "User"("id"),
					foreign key ("tournamentTeamHistoryId") references "TournamentTeamHistory"("id")
				) strict
			`,
		).run();

		db.prepare(
			/* sql */ `
				insert into "TournamentAuditLog_new" ("id", "tournamentId", "type", "actorUserId", "subjectUserId", "tournamentTeamHistoryId", "metadata", "createdAt")
				select "id", "tournamentId", "type", "actorUserId", "subjectUserId", "tournamentTeamHistoryId", "metadata", "createdAt"
				from "TournamentAuditLog"
			`,
		).run();

		db.prepare(/* sql */ `drop table "TournamentAuditLog"`).run();

		db.prepare(
			/* sql */ `alter table "TournamentAuditLog_new" rename to "TournamentAuditLog"`,
		).run();

		db.prepare(
			/* sql */ `create index tournament_audit_log_tournament_id_created_at_idx on "TournamentAuditLog"("tournamentId", "createdAt")`,
		).run();
		db.prepare(
			/* sql */ `create index tournament_audit_log_tournament_id_team_history_id_type_created_at_idx on "TournamentAuditLog"("tournamentId", "tournamentTeamHistoryId", "type", "createdAt")`,
		).run();

		db.prepare(
			/* sql */ `
				update "TournamentStage"
				set "createdAt" = coalesce(
					(
						select min("CalendarEventDate"."startsAt")
						from "CalendarEvent"
						inner join "CalendarEventDate" on "CalendarEventDate"."eventId" = "CalendarEvent"."id"
						where "CalendarEvent"."tournamentId" = "TournamentStage"."tournamentId"
					),
					strftime('%s', 'now')
				)
				where "createdAt" is null
			`,
		).run();

		db.prepare(
			/* sql */ `
				create table "TournamentStage_new" (
					"id" integer primary key,
					"tournamentId" integer not null,
					"name" text not null,
					"type" text not null,
					"settings" text not null,
					"number" integer not null,
					"createdAt" integer default (strftime('%s', 'now')) not null,
					foreign key ("tournamentId") references "Tournament"("id") on delete cascade,
					unique("number", "tournamentId") on conflict rollback
				) strict
			`,
		).run();

		db.prepare(
			/* sql */ `
				insert into "TournamentStage_new" ("id", "tournamentId", "name", "type", "settings", "number", "createdAt")
				select "id", "tournamentId", "name", "type", "settings", "number", "createdAt"
				from "TournamentStage"
			`,
		).run();

		db.prepare(/* sql */ `drop table "TournamentStage"`).run();

		db.prepare(
			/* sql */ `alter table "TournamentStage_new" rename to "TournamentStage"`,
		).run();

		db.prepare(
			/* sql */ `create index tournament_stage_tournament_id on "TournamentStage"("tournamentId")`,
		).run();

		db.pragma("foreign_key_check");
	})();

	db.pragma("foreign_keys = ON");
}

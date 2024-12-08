export function up(db) {
	db.transaction(() => {
		db.prepare(
			/*sql*/ `
      create table "ScrimPost" (
      "id" integer primary key,
      "at" integer not null,
      "maxDiv" integer,
      "minDiv" integer,
      "visibility" integer,
      "text" text,
      "chatCode" text not null,
      "teamId" integer,
      "createdAt" integer default (strftime('%s', 'now')) not null,
      "updatedAt" integer default (strftime('%s', 'now')) not null,
      foreign key ("teamId") references "AllTeam"("id") on delete cascade
      ) strict
`,
		).run();

		db.prepare(
			/*sql*/ `create index scrim_post_team_id on "ScrimPost"("teamId")`,
		).run();
		db.prepare(/*sql*/ `create index scrim_post_at on "ScrimPost"("at")`).run();

		db.prepare(
			/*sql*/ `
  create table "ScrimPostUser" (
  "scrimPostId" integer not null,
  "userId" integer not null,
  "isOwner" integer not null,
  unique("scrimPostId", "userId") on conflict rollback,
  foreign key ("scrimPostId") references "ScrimPost"("id") on delete cascade,
  foreign key ("userId") references "User"("id") on delete cascade
  ) strict
`,
		).run();

		db.prepare(
			/*sql*/ `
  create table "ScrimPostRequest" (
  "id" integer primary key,
  "scrimPostId" integer not null,
  "teamId" integer,
  "isAccepted" integer default 0 not null,
  "createdAt" integer default (strftime('%s', 'now')) not null,
  unique("scrimPostId", "teamId") on conflict rollback,
  foreign key ("scrimPostId") references "ScrimPost"("id") on delete cascade,
  foreign key ("teamId") references "AllTeam"("id") on delete cascade
  ) strict
`,
		).run();

		db.prepare(
			/*sql*/ `create index scrim_post_request_scrim_post_id on "ScrimPostRequest"("scrimPostId")`,
		).run();
		db.prepare(
			/*sql*/ `create index scrim_post_request_team_id on "ScrimPostRequest"("teamId")`,
		).run();

		db.prepare(
			/*sql*/ `
  create table "ScrimPostRequestUser" (
  "scrimPostRequestId" integer not null,
  "userId" integer not null,
  "isOwner" integer not null,
  unique("scrimPostRequestId", "userId") on conflict rollback,
  foreign key ("scrimPostRequestId") references "ScrimPostRequest"("id") on delete cascade,
  foreign key ("userId") references "User"("id") on delete cascade
  ) strict
`,
		).run();

		db.prepare(
			/*sql*/ `create index scrim_post_request_user_scrim_post_request_id on "ScrimPostRequestUser"("scrimPostRequestId")`,
		).run();
		db.prepare(
			/*sql*/ `create index scrim_post_request_user_user_id on "ScrimPostRequestUser"("userId")`,
		).run();
	})();
}

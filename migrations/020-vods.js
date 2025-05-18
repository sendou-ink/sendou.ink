export function up(db) {
	db.prepare(
		`alter table "User" add column "isVideoAdder" integer default 0`,
	).run();

	db.prepare(
		/*sql*/ `
  create table "UnvalidatedVideo" (
    "id" integer primary key,
    "title" text not null,
    "type" text not null,
    "youtubeId" text not null,
    "youtubeDate" integer not null,
    "submitterUserId" integer not null,
    "validatedAt" integer,
    "eventId" integer,
    foreign key ("submitterUserId") references "User"("id") on delete restrict,
    foreign key ("eventId") references "CalendarEvent"("id") on delete restrict
  ) strict
  `,
	).run();

	db.prepare(
		`create index video_event_id on "UnvalidatedVideo"("eventId")`,
	).run();

	db.prepare(
		/*sql*/ `
      create view "Video"
      as
      select * from "UnvalidatedVideo" where "validatedAt" is not null
  `,
	).run();

	db.prepare(
		/*sql*/ `
    create table "VideoMatch" (
      "id" integer primary key,
      "videoId" integer not null,
      "startsAt" integer not null,
      "stageId" integer not null,
      "mode" text not null,
      foreign key ("videoId") references "UnvalidatedVideo"("id") on delete cascade
    ) strict
    `,
	).run();
	db.prepare(
		`create index video_match_video_id on "VideoMatch"("videoId")`,
	).run();

	db.prepare(
		/*sql*/ `
    create table "VideoMatchPlayer" (
      "videoMatchId" integer not null,
      "playerUserId" integer,
      "playerName" text,
      "weaponSplId" integer not null,
      "player" integer not null,
      foreign key ("videoMatchId") references "VideoMatch"("id") on delete cascade,
      foreign key ("playerUserId") references "User"("id") on delete restrict
    ) strict
    `,
	).run();
	db.prepare(
		`create index video_match_player_video_match_id on "VideoMatchPlayer"("videoMatchId")`,
	).run();
	db.prepare(
		`create index video_match_player_player_user_id on "VideoMatchPlayer"("playerUserId")`,
	).run();
}

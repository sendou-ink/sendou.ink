export function up(db) {
	db.prepare(
		/*sql*/ `
    create table "UnvalidatedUserSubmittedImage" (
      "id" integer primary key,
      "validatedAt" integer,
      "url" text not null unique
    ) strict
    `,
	).run();

	db.prepare(
		/*sql*/ `
      create view "UserSubmittedImage"
      as
      select * from "UnvalidatedUserSubmittedImage" where "validatedAt" is not null
  `,
	).run();

	db.prepare(
		/*sql*/ `
    create table "AllTeam" (
      "id" integer primary key,
      "name" text not null,
      "customUrl" text not null,
      "inviteCode" text not null,
      "bio" text,
      "twitter" text,
      "avatarImgId" integer,
      "bannerImgId" integer,
      "createdAt" integer default (strftime('%s', 'now')) not null,
      "deletedAt" integer,
      foreign key ("avatarImgId") references "UnvalidatedUserSubmittedImage"("id") on delete set null,
      foreign key ("bannerImgId") references "UnvalidatedUserSubmittedImage"("id") on delete set null
    ) strict
    `,
	).run();
	db.prepare(`create index team_custom_url on "AllTeam"("customUrl")`).run();

	db.prepare(
		/*sql*/ `
      create view "Team"
      as
      select * from "AllTeam" where "deletedAt" is null
  `,
	).run();

	db.prepare(
		/*sql*/ `
    create table "AllTeamMember" (
      "teamId" integer not null,
      "userId" integer not null,
      "role" text,
      "isOwner" integer not null default 0,
      "createdAt" integer default (strftime('%s', 'now')) not null,
      "leftAt" integer,
      foreign key ("teamId") references "AllTeam"("id") on delete cascade,
      foreign key ("userId") references "User"("id") on delete cascade,
      unique("teamId", "userId") on conflict rollback
    ) strict
    `,
	).run();

	db.prepare(
		/*sql*/ `
      create view "TeamMember"
      as
      select "AllTeamMember".* 
      from "AllTeamMember"
        left join "Team" on "Team"."id" = "AllTeamMember"."teamId"
      where "AllTeamMember"."leftAt" is null 
        and 
      -- if team id is null the team is deleted
      "Team"."id" is not null
  `,
	).run();
}

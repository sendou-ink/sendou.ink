export function up(db) {
	db.prepare(
		`
  create table "User" (
    "id" integer primary key,
    "discordId" text unique not null,
    "discordName" text not null,
    "discordDiscriminator" text not null,
    "discordAvatar" text,
    "twitch" text,
    "twitter" text,
    "youtubeId" text,
    "bio" text,
    "country" text
  ) strict
  `,
	).run();

	db.prepare(
		`
  create table "PlusSuggestion" (
    "id" integer primary key,
    "text" text not null,
    "authorId" integer not null,
    "suggestedId" integer not null,
    "month" integer not null,
    "year" integer not null,
    "tier" integer not null,
    "createdAt" integer default (strftime('%s', 'now')) not null,
    foreign key ("authorId") references "User"("id") on delete cascade,
    foreign key ("suggestedId") REFERENCES "User"("id") ON delete cascade,
    unique(
      "month",
      "year",
      "suggestedId",
      "authorId",
      "tier"
    ) on conflict rollback
  ) strict
  `,
	).run();
	db.prepare(
		`create index plus_suggestion_author_id on "PlusSuggestion"("authorId")`,
	).run();
	db.prepare(
		`create index plus_suggestion_suggested_id on "PlusSuggestion"("suggestedId")`,
	).run();

	db.prepare(
		`
  create table "PlusVote" (
    "month" integer not null,
    "year" integer not null,
    "tier" integer not null,
    "authorId" integer not null,
    "votedId" integer not null,
    "score" integer not null,
    "validAfter" integer not null,
    foreign key ("authorId") references "User"("id") on delete cascade,
    foreign key ("votedId") references "User"("id") on delete cascade,
    unique("month", "year", "authorId", "votedId") on conflict rollback
  ) strict
  `,
	).run();
	db.prepare(
		`create index plus_vote_author_id on "PlusVote"("authorId");`,
	).run();
	db.prepare(`create index plus_vote_voted_id on "PlusVote"("votedId");`).run();

	db.prepare(
		`
  create view "PlusVotingResult" as
  select
    "votedId",
    "tier",
    avg("score") as "score",
    avg("score") >= 0 as "passedVoting",
    "month",
    "year",
    exists (
      select
        1
      from
        "PlusSuggestion"
      where
        "PlusSuggestion"."month" = "PlusVote"."month"
        and "PlusSuggestion"."year" = "PlusVote"."year"
        and "PlusSuggestion"."suggestedId" = "PlusVote"."votedId"
        AND "PlusSuggestion"."tier" = "PlusVote"."tier"
    ) as "wasSuggested"
  from
    "PlusVote"
  group by
    "votedId",
    "tier",
    "month",
    "year";
  `,
	).run();

	db.prepare(
		`
  create view "PlusTier" as
  select
    "votedId" as "userId",
    case
      when "passedVoting" = 0
      and "wasSuggested" = 1 then null
      when "passedVoting" = 1 then "tier"
      when "passedVoting" = 0
      and "tier" != 3 then "tier" + 1
    end "tier"
  from
    "PlusVotingResult"
  where
    year = (
      select
        "year"
      from
        "PlusVote"
      where
        "validAfter" < strftime('%s', 'now')
      order by
        "year" desc,
        "month" desc
      limit
        1
    )
    and "month" = (
      select
        "month"
      from
        "PlusVote"
      where
        "validAfter" < strftime('%s', 'now')
      order by
        "year" desc,
        "month" desc
      limit
        1
    )
    group by
      "votedId";
  `,
	).run();
}

export function down(db) {
	db.prepare(`drop view "PlusVotingResult"`).run();
	db.prepare(`drop view "PlusTier"`).run();
	db.prepare(`drop table "User"`).run();
	db.prepare(`drop table "PlusSuggestion"`).run();
	db.prepare(`drop table "PlusVote"`).run();
}

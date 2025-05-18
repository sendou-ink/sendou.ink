export function up(db) {
	db.prepare(`drop view "PlusTier"`).run();

	db.prepare(
		/* sql */ `
    create view "FreshPlusTier" as
    select
      "votedId" as "userId",
      min(
        case
          when "passedVoting" = 0
            and "wasSuggested" = 1 then null
          when "passedVoting" = 1 then "tier"
          when "passedVoting" = 0
            and "tier" != 3 then "tier" + 1
        end
      ) as "tier"
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

	db.prepare(
		/* sql */ `
    create table "PlusTier" (
      "userId" integer primary key,
      "tier" integer not null,
      foreign key ("userId") references "User"("id") on delete set null
    ) strict
  `,
	).run();

	db.prepare(
		/* sql */ `
    insert into "PlusTier" ("userId", "tier") select "userId", "tier" from "FreshPlusTier" where "tier" is not null;
  `,
	).run();
}

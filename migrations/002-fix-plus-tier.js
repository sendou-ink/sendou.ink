// add missing min() call to handle multiple results w/ suggests correctly

export function up(db) {
	db.prepare(`drop view "PlusTier"`).run();

	db.prepare(
		`
    create view "PlusTier" as
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
}

export function down(db) {
	db.prepare(`drop view "PlusTier"`).run();

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

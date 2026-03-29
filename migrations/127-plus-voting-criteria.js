export function up(db) {
	db.transaction(() => {
		db.prepare(`drop view "FreshPlusTier"`).run();
		db.prepare(`drop view "PlusVotingResult"`).run();

		db.prepare(
			/* sql */ `
      create view "PlusVotingResult" as
      select
        "votedId",
        "tier",
        avg("score") as "score",
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
            and "PlusSuggestion"."tier" = "PlusVote"."tier"
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
	})();
}

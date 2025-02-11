export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "AllTeamMember" add "isMainTeam" integer default 1`,
		).run();

		db.prepare(/*sql */ `drop view "TeamMember"`).run();
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
          and
        "AllTeamMember"."isMainTeam" = 1
    `,
		).run();

		db.prepare(
			/*sql*/ `
        create view "TeamMemberWithSecondary"
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
	})();
}

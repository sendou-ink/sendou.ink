export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "AllTeamMember" add "customRole" text`,
		).run();
		db.prepare(
			/* sql */ `alter table "AllTeamMember" add "roleType" text`,
		).run();
		db.prepare(
			/* sql */ `alter table "AllTeamMember" add "order" integer not null default 0`,
		).run();
		db.prepare(
			/* sql */ `update "AllTeamMember"
				set "order" = sub.rn
				from (
					select
						"userId",
						"teamId",
						row_number() over (
							partition by "teamId"
							order by "isOwner" desc, "createdAt" asc, "userId" asc
						) - 1 as rn
					from "AllTeamMember"
				) as sub
				where "AllTeamMember"."userId" = sub."userId"
					and "AllTeamMember"."teamId" = sub."teamId"`,
		).run();
	})();
}

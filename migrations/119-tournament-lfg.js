export function up(db) {
	db.transaction(() => {
		db.prepare(
			/*sql*/ `alter table "TournamentTeam" add column "isLooking" integer not null default 0`,
		).run();
		// xxx: index on isLooking too to get efficient queries? problem -> we query tournamentTeamMember.userId (different table)
		db.prepare(
			/*sql*/ `alter table "TournamentTeam" add column "isPlaceholder" integer not null default 0`,
		).run();
		db.prepare(
			/*sql*/ `alter table "TournamentTeam" add column "lfgVisibility" text`,
		).run();
		db.prepare(
			/*sql*/ `alter table "TournamentTeam" add column "lfgNote" text`,
		).run();

		db.prepare(
			/*sql*/ `alter table "TournamentTeamMember" add column "role" text not null default 'REGULAR'`,
		).run();
		db.prepare(
			/*sql*/ `alter table "TournamentTeamMember" add column "isStayAsSub" integer not null default 0`,
		).run();

		db.prepare(
			/*sql*/ `update "TournamentTeamMember" set "role" = 'OWNER' where "isOwner" = 1`,
		).run();

		db.prepare(
			/*sql*/ `
      create table "TournamentLFGLike" (
        "likerTeamId" integer not null,
        "targetTeamId" integer not null,
        "createdAt" integer default (strftime('%s', 'now')) not null,
        foreign key ("likerTeamId") references "TournamentTeam"("id") on delete cascade,
        foreign key ("targetTeamId") references "TournamentTeam"("id") on delete cascade,
        unique("likerTeamId", "targetTeamId") on conflict rollback
      ) strict
    `,
		).run();

		db.prepare(
			/*sql*/ `create index tournament_lfg_like_liker_team_id on "TournamentLFGLike"("likerTeamId")`,
		).run();
		db.prepare(
			/*sql*/ `create index tournament_lfg_like_target_team_id on "TournamentLFGLike"("targetTeamId")`,
		).run();
	})();
}

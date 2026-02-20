export function up(db) {
	db.transaction(() => {
		db.prepare(
			/*sql*/ `
      create table "TournamentLFGGroup" (
        "id" integer primary key,
        "tournamentId" integer not null,
        "tournamentTeamId" integer,
        "visibility" text,
        "chatCode" text not null,
        "createdAt" integer default (strftime('%s', 'now')) not null,
        foreign key ("tournamentId") references "Tournament"("id") on delete cascade,
        foreign key ("tournamentTeamId") references "TournamentTeam"("id") on delete cascade
      ) strict
    `,
		).run();

		db.prepare(
			/*sql*/ `create index tournament_lfg_group_tournament_id on "TournamentLFGGroup"("tournamentId")`,
		).run();
		db.prepare(
			/*sql*/ `create index tournament_lfg_group_tournament_team_id on "TournamentLFGGroup"("tournamentTeamId")`,
		).run();

		db.prepare(
			/*sql*/ `
      create table "TournamentLFGGroupMember" (
        "groupId" integer not null,
        "tournamentId" integer not null,
        "userId" integer not null,
        "role" text not null,
        "note" text,
        "isStayAsSub" integer default 0 not null,
        "createdAt" integer default (strftime('%s', 'now')) not null,
        foreign key ("groupId") references "TournamentLFGGroup"("id") on delete cascade,
        foreign key ("userId") references "User"("id") on delete cascade,
        unique("tournamentId", "userId") on conflict rollback
      ) strict
    `,
		).run();

		db.prepare(
			/*sql*/ `create index tournament_lfg_group_member_group_id on "TournamentLFGGroupMember"("groupId")`,
		).run();
		db.prepare(
			/*sql*/ `create index tournament_lfg_group_member_user_id on "TournamentLFGGroupMember"("userId")`,
		).run();

		db.prepare(
			/*sql*/ `
      create table "TournamentLFGLike" (
        "likerGroupId" integer not null,
        "targetGroupId" integer not null,
        "createdAt" integer default (strftime('%s', 'now')) not null,
        foreign key ("likerGroupId") references "TournamentLFGGroup"("id") on delete cascade,
        foreign key ("targetGroupId") references "TournamentLFGGroup"("id") on delete cascade,
        unique("likerGroupId", "targetGroupId") on conflict rollback
      ) strict
    `,
		).run();

		db.prepare(
			/*sql*/ `create index tournament_lfg_like_liker_group_id on "TournamentLFGLike"("likerGroupId")`,
		).run();
		db.prepare(
			/*sql*/ `create index tournament_lfg_like_target_group_id on "TournamentLFGLike"("targetGroupId")`,
		).run();
	})();
}

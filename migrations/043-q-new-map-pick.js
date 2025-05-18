export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "User" add "mapModePreferences" text`,
		).run();
		db.prepare(/* sql */ `alter table "User" add "qWeaponPool" text`).run();

		db.prepare(`alter table "Group" drop column "mapListPreference"`).run();

		db.prepare("drop index map_pool_map_group_id").run();
		db.prepare(`delete from "MapPoolMap" where "groupId" is not null`).run();
		db.prepare(`alter table "MapPoolMap" drop column "groupId"`).run();

		db.prepare(
			/*sql*/ `
      create table "PrivateUserNote" (
        "authorId" integer not null,
        "targetId" integer not null,
        "text" text,
        "sentiment" text not null,
        "updatedAt" integer default (strftime('%s', 'now')) not null,
        foreign key ("authorId") references "User"("id") on delete cascade,
        foreign key ("targetId") references "User"("id") on delete cascade,
        unique("authorId", "targetId") on conflict rollback
      ) strict
    `,
		).run();
	})();
}

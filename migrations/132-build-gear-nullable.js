export function up(db) {
	db.pragma("foreign_keys = OFF");

	db.transaction(() => {
		db.prepare(
			/*sql*/ `
      create table "Build_new" (
        "id" integer primary key,
        "ownerId" integer not null,
        "title" text not null,
        "description" text,
        "modes" text,
        "headGearSplId" integer,
        "clothesGearSplId" integer,
        "shoesGearSplId" integer,
        "updatedAt" integer default (strftime('%s', 'now')) not null,
        "private" integer default 0,
        foreign key ("ownerId") references "User"("id") on delete restrict
      ) strict
    `,
		).run();

		db.prepare(
			/*sql*/ `
      insert into "Build_new" ("id", "ownerId", "title", "description", "modes", "headGearSplId", "clothesGearSplId", "shoesGearSplId", "updatedAt", "private")
      select
        "id",
        "ownerId",
        "title",
        "description",
        "modes",
        case when "headGearSplId" = -1 then null else "headGearSplId" end,
        case when "clothesGearSplId" = -1 then null else "clothesGearSplId" end,
        case when "shoesGearSplId" = -1 then null else "shoesGearSplId" end,
        "updatedAt",
        "private"
      from "Build"
    `,
		).run();

		db.prepare(/*sql*/ `drop table "Build"`).run();

		db.prepare(/*sql*/ `alter table "Build_new" rename to "Build"`).run();

		db.prepare(
			/*sql*/ `create index build_owner_id on "Build"("ownerId")`,
		).run();

		db.pragma("foreign_key_check");
	})();

	db.pragma("foreign_keys = ON");
}

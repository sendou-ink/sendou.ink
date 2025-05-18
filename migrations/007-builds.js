export function up(db) {
	db.prepare(
		`
    create table "Build" (
      "id" integer primary key,
      "ownerId" integer not null,
      "title" text not null,
      "description" text,
      "modes" text,
      "headGearSplId" integer not null,
      "clothesGearSplId" integer not null,
      "shoesGearSplId" integer not null,
      "updatedAt" integer default (strftime('%s', 'now')) not null,
      foreign key ("ownerId") references "User"("id") on delete restrict
    ) strict
    `,
	).run();
	db.prepare(`create index build_owner_id on "Build"("ownerId")`).run();

	db.prepare(
		`
    create table "BuildWeapon" (
      "buildId" integer not null,
      "weaponSplId" integer not null,
      foreign key ("buildId") references "Build"("id") on delete cascade,
      unique("buildId", "weaponSplId") on conflict rollback
    ) strict
    `,
	).run();
	db.prepare(
		`create index build_weapon_build_id on "BuildWeapon"("buildId")`,
	).run();

	db.prepare(
		`
    create table "BuildAbility" (
      "buildId" integer not null,
      "gearType" text not null,
      "ability" text not null,
      "slotIndex" integer not null,
      foreign key ("buildId") references "Build"("id") on delete cascade,
      unique("buildId", "gearType", "slotIndex") on conflict rollback
    ) strict
    `,
	).run();
	db.prepare(
		`create index build_ability_build_id on "BuildAbility"("buildId")`,
	).run();
}

export function down(db) {
	for (const table of ["Build", "BuildWeapon", "BuildAbility"]) {
		db.prepare(`drop table "${table}"`).run();
	}
}

export function up(db) {
	db.prepare(
		`
  create table "UserWeapon" (
    "userId" integer not null,
    "weaponSplId" integer not null,
    "order" integer not null,
    "createdAt" integer default (strftime('%s', 'now')) not null,
    unique("userId", "weaponSplId") on conflict rollback,
    unique("userId", "order") on conflict rollback,
    foreign key ("userId") references "User"("id") on delete restrict
  ) strict
  `,
	).run();

	db.prepare(
		`create index user_weapon_user_id on "UserWeapon"("userId")`,
	).run();
}

export function down(db) {
	db.prepare(`drop table "UserWeapon"`).run();
}

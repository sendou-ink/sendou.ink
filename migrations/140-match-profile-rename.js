export function up(db) {
	db.prepare(
		/* sql */ `alter table "User" rename column "qWeaponPool" to "weaponPool"`,
	).run();
}

export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "BuildWeapon" add column "isTop500" integer not null default 0`,
		).run();

		db.prepare(
			/* sql */ `alter table "BuildWeapon" add column "tier" integer not null default 4`,
		).run();

		db.prepare(
			/* sql */ `alter table "BuildWeapon" add column "updatedAt" integer default 1760608251`,
		).run();

		// speeds up resolving /popular builds
		db.prepare(
			/* sql */ `create index build_weapon_weapon_spl_id_build_id on "BuildWeapon"("weaponSplId", "buildId")`,
		).run();

		// speeds up weapon builds list page
		db.prepare(
			/* sql */ `create index idx_buildweapon_lookup on "BuildWeapon"("weaponSplId", "tier" asc, "isTop500" desc, "updatedAt" desc)`,
		).run();
	})();
}

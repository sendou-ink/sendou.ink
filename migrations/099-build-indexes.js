export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `CREATE INDEX build_weapon_weapon_spl_id_build_id ON "BuildWeapon"("weaponSplId", "buildId")`,
		).run();

		db.prepare(
			/* sql */ `CREATE INDEX build_private ON "Build"("private")`,
		).run();
	})();
}

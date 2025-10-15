export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `ALTER TABLE "BuildWeapon" ADD COLUMN "isTop500" INTEGER NOT NULL DEFAULT 0`,
		).run();

		db.prepare(
			/* sql */ `CREATE INDEX build_weapon_weapon_spl_id_build_id ON "BuildWeapon"("weaponSplId", "buildId")`,
		).run();

		db.prepare(
			/* sql */ `CREATE INDEX build_private_owner_id ON "Build"("private", "ownerId")`,
		).run();
	})();
}

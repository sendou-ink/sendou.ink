export function up(db) {
	db.transaction(() => {
		db.prepare(
			/*sql*/ `
      alter table "SplatoonPlayer"
      add column "peakXp" real
    `,
		).run();

		db.prepare(
			/*sql*/ `
      update "SplatoonPlayer"
      set "peakXp" = (
        select max("XRankPlacement"."power")
        from "XRankPlacement"
        where "XRankPlacement"."playerId" = "SplatoonPlayer"."id"
      )
    `,
		).run();
	})();
}

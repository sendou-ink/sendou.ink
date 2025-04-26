export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "User" add "favoriteBadgeIds" text`,
		).run();
		db.prepare(/* sql */ `update "User"
      set "favoriteBadgeIds" = 
          case
              when "favoriteBadgeId" is not null then '[' || "favoriteBadgeId" || ']'
              else null
          end;`).run();
		db.prepare(
			/* sql */ `alter table "User" drop column "favoriteBadgeId"`,
		).run();
	})();
}

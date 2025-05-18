export function up(db) {
	db.prepare(`alter table "Badge" add "hue" integer`).run();
	db.prepare(`update "Badge" set "hue" = -72 where "code" = 'ebtv'`).run();
}

export function down(db) {
	db.prepare(`alter table "Badge" drop column "hue"`).run();
}

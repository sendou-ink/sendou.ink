export function up(db) {
	db.prepare(`alter table "User" add "customUrl" text`).run();
	db.prepare(
		`create unique index user_custom_url_unique on "User"("customUrl")`,
	).run();

	db.prepare(`alter table "User" add "stickSens" integer`).run();
	db.prepare(`alter table "User" add "motionSens" integer`).run();

	db.prepare(`alter table "User" add "inGameName" text`).run();
}

export function down(db) {
	db.prepare("drop index user_custom_url_unique").run();
	db.prepare(`alter table "User" drop column "customUrl"`).run();
	db.prepare(`alter table "User" drop column "stickSens"`).run();
	db.prepare(`alter table "User" drop column "motionSens"`).run();
	db.prepare(`alter table "User" drop column "inGameName"`).run();
}

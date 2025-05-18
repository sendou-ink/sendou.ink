export function up(db) {
	for (const badge of itzBadges) {
		db.prepare(
			`insert into "Badge" ("code", "displayName") values ($code, $displayName)`,
		).run(badge);
	}
}

export function down(db) {
	db.prepare(
		`delete from "Badge" where "code" in ('itz_red', 'itz_orange', 'itz_blue')`,
	).run();
}

const itzBadges = [
	{
		code: "itz_red",
		displayName: "In The Zone 1-9",
	},
	{
		code: "itz_orange",
		displayName: "In The Zone 10-19",
	},
	{
		code: "itz_blue",
		displayName: "In The Zone 20-29",
	},
];

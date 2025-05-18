export function up(db) {
	db.prepare(
		`
    create table "Badge" (
      "id" integer primary key,
      "code" text not null,
      "displayName" text not null
    ) strict
  `,
	).run();

	for (const badge of initialBadgesForDb()) {
		db.prepare(
			`insert into "Badge" ("code", "displayName") values ($code, $displayName)`,
		).run(badge);
	}

	db.prepare(
		`
    create table "BadgeOwner" (
      "badgeId" integer not null,
      "userId" integer not null
    ) strict
  `,
	).run();

	db.prepare(
		`
    create table "BadgeManager" (
      "badgeId" integer not null,
      "userId" integer not null,
      unique("badgeId", "userId") on conflict rollback
    ) strict
  `,
	).run();
}

export function down(db) {
	db.prepare(`drop table "Badge"`).run();
	db.prepare(`drop table "BadgeOwner"`).run();
	db.prepare(`drop table "BadgeManager"`).run();
}

function initialBadgesForDb() {
	return [
		{
			code: "sundae",
			displayName: "4v4 Sundaes",
		},
		{
			code: "zones",
			displayName: "Dapple SZ Speedladder",
		},
		{
			code: "ebtv",
			displayName: "EBTV League",
		},
		{
			code: "girls",
			displayName: "Girls Duo Cup",
		},
		{
			code: "idtga",
			displayName: "It's Dangerous to go Alone",
		},
		{
			code: "beta_top1",
			displayName: "Beta's Events",
		},
		{
			code: "beta_top2",
			displayName: "Launch Day",
		},
		{
			code: "beta_top3",
			displayName: "Launch Day",
		},
		{
			code: "pair",
			displayName: "League Rush (Pair)",
		},
		{
			code: "quad",
			displayName: "League Rush (Quad)",
		},
		{
			code: "lobster",
			displayName: "Lobster Crossfire",
		},
		{
			code: "monday",
			displayName: "Monday Afterparty",
		},
		{
			code: "pool1",
			displayName: "Paddling Pool Weekly",
		},
		{
			code: "snapshot_gold",
			displayName: "Snapshot (Alpha)",
		},
		{
			code: "snapshot_silver",
			displayName: "Snapshot (Beta)",
		},
		{
			code: "snapshot_bronze",
			displayName: "Snapshot (Gamma)",
		},
		{
			code: "superjump_alpha",
			displayName: "Superjump",
		},
		{
			code: "superjump_beta",
			displayName: "Superjump (Beta bracket)",
		},
		{
			code: "superjump_gamma",
			displayName: "Superjump (Gamma bracket)",
		},
		{
			code: "toni_kensa",
			displayName: "Toni Kensa Cup",
		},
		{
			code: "pool2",
			displayName: "Golden Paddling Pool Event",
		},
		{
			code: "lutipink",
			displayName: "LUTI Season 12 (Div X)",
		},
		{
			code: "lutired",
			displayName: "LUTI Season 12 (Div 1)",
		},
		{
			code: "lutiorange",
			displayName: "LUTI Season 12 (Div 2)",
		},
		{
			code: "lutiyellow",
			displayName: "LUTI Season 12 (Div 3)",
		},
		{
			code: "lutilimegreen",
			displayName: "LUTI Season 12 (Div 4)",
		},
		{
			code: "lutigreen",
			displayName: "LUTI Season 12 (Div 5)",
		},
		{
			code: "lutiblue",
			displayName: "LUTI Season 12 (Div 6)",
		},
		{
			code: "lutipurple",
			displayName: "LUTI Season 12 (Div 7)",
		},
		{
			code: "lutitan",
			displayName: "LUTI Season 12 (Div 8)",
		},
		{
			code: "lutitan",
			displayName: "LUTI Season 12 (Div 9)",
		},
		{
			code: "tidal_tuesdays",
			displayName: "Tidal Tuesdays",
		},
		{
			code: "squid_junction",
			displayName: "Squid Junction",
		},
		{
			code: "triton",
			displayName: "Triton-Cup",
		},
		{
			code: "cake",
			displayName: "Yay's SUPER AWESOME Birthday Bash!",
		},
		{
			code: "20xx",
			displayName: "a 20XX Series tournament",
		},
	];
}

export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
				create table "UserWeaponPool" (
					"userId" integer not null,
					"sortOrder" integer not null,
					"weaponSplId" integer not null,
					"isFavorite" integer not null default 0,
					foreign key ("userId") references "User"("id") on delete cascade,
					primary key ("userId", "sortOrder")
				) strict
			`,
		).run();

		db.prepare(
			/* sql */ `
				insert into "UserWeaponPool" ("userId", "sortOrder", "weaponSplId", "isFavorite")
				select
					u."id",
					je."key",
					json_extract(je."value", '$.weaponSplId'),
					coalesce(json_extract(je."value", '$.isFavorite'), 0)
				from "User" u, json_each(u."weaponPool") je
				where u."weaponPool" is not null
			`,
		).run();

		db.prepare(
			/* sql */ `
				create table "TenStarWeapon" (
					"userId" integer not null,
					"weaponSplId" integer not null,
					foreign key ("userId") references "User"("id") on delete cascade,
					primary key ("userId", "weaponSplId")
				) strict
			`,
		).run();

		db.prepare(
			/* sql */ `
				insert into "TenStarWeapon" ("userId", "weaponSplId")
				select distinct sp."userId", xrp."weaponSplId"
				from "XRankPlacement" xrp
				inner join "SplatoonPlayer" sp on sp."id" = xrp."playerId"
				where sp."userId" is not null
				and (
					xrp."region" = 'JPN'
					or (xrp."region" = 'WEST' and xrp."rank" <= 100)
				)
			`,
		).run();

		db.pragma("foreign_key_check");
	})();
}

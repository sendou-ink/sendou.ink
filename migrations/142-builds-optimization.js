export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "Build" add column "abilities" text`,
		).run();

		db.prepare(
			/* sql */ `alter table "Build" add column "abilitiesSignature" text`,
		).run();

		db.prepare(
			/* sql */ `
				create table "BuildAbilitySum" (
					"buildId" integer not null,
					"ability" text not null,
					"abilityPoints" integer not null,
					foreign key ("buildId") references "Build"("id") on delete cascade,
					unique("buildId", "ability") on conflict rollback
				) strict
			`,
		).run();

		db.prepare(
			/* sql */ `
				create table "BuildWeaponAbility" (
					"weaponSplId" integer not null,
					"buildId" integer not null,
					"ability" text not null,
					"abilityPoints" integer not null,
					foreign key ("buildId") references "Build"("id") on delete cascade,
					unique("weaponSplId", "buildId", "ability") on conflict rollback
				) strict
			`,
		).run();

		db.prepare(
			/* sql */ `
				update "Build" set "abilities" = (
					select json_array(
						(
							select json_group_array("ability") from (
								select "ability" from "BuildAbility"
								where "buildId" = "Build"."id" and "gearType" = 'HEAD'
								order by "slotIndex"
							)
						),
						(
							select json_group_array("ability") from (
								select "ability" from "BuildAbility"
								where "buildId" = "Build"."id" and "gearType" = 'CLOTHES'
								order by "slotIndex"
							)
						),
						(
							select json_group_array("ability") from (
								select "ability" from "BuildAbility"
								where "buildId" = "Build"."id" and "gearType" = 'SHOES'
								order by "slotIndex"
							)
						)
					)
				)
			`,
		).run();

		// Public builds only: private builds are never surfaced in stats/popular
		// queries, so excluding them here turns the sum-table queries into pure
		// covering-index scans (no Build join needed for the private filter).
		db.prepare(
			/* sql */ `
				insert into "BuildAbilitySum" ("buildId", "ability", "abilityPoints")
				select "ba"."buildId", "ba"."ability", sum("ba"."abilityPoints")
				from "BuildAbility" as "ba"
				inner join "Build" as "b" on "b"."id" = "ba"."buildId"
				where "b"."private" = 0
				group by "ba"."buildId", "ba"."ability"
			`,
		).run();

		// `weaponSplId` here is the *canonical* weapon (alt skins folded into
		// their base) so a build that lists multiple alt skins of the same
		// weapon only contributes its ability points once. `insert or ignore`
		// handles the dedup against the unique(weaponSplId, buildId, ability).
		db.prepare(
			/* sql */ `
				insert or ignore into "BuildWeaponAbility" ("weaponSplId", "buildId", "ability", "abilityPoints")
				select
					case "bw"."weaponSplId"
						when 45 then 40
						when 47 then 40
						when 46 then 41
						when 205 then 200
						when 1015 then 1010
						when 1115 then 1110
						when 2015 then 2010
						when 3005 then 3000
						when 4015 then 4010
						when 5015 then 5010
						when 6005 then 6000
						when 7015 then 7010
						when 8005 then 8000
						else "bw"."weaponSplId"
					end,
					"bs"."buildId", "bs"."ability", "bs"."abilityPoints"
				from "BuildAbilitySum" as "bs"
				inner join "BuildWeapon" as "bw" on "bw"."buildId" = "bs"."buildId"
			`,
		).run();

		db.prepare(
			/* sql */ `
				update "Build" set "abilitiesSignature" = (
					select group_concat("ability" || '_' || "abilityPoints", ',') from (
						select "ability", "abilityPoints" from "BuildAbilitySum"
						where "buildId" = "Build"."id"
						order by "abilityPoints" desc, "ability" asc
					)
				)
			`,
		).run();

		// Covering indexes: `abilityPoints` included so SUM(...) GROUP BY ability
		// can be answered entirely from the index without rowid lookups.
		db.prepare(
			/* sql */ `create index build_ability_sum_ability_ap on "BuildAbilitySum"("ability", "abilityPoints")`,
		).run();

		db.prepare(
			/* sql */ `create index build_weapon_ability_weapon_ability_ap on "BuildWeaponAbility"("weaponSplId", "ability", "abilityPoints")`,
		).run();

		db.prepare(
			/* sql */ `create index build_abilities_signature on "Build"("abilitiesSignature")`,
		).run();

		// sortValue lives only on BuildWeapon — it depends on the owner's plus
		// tier and on whether the owner has an X Rank placement for *this
		// specific weapon*. The `(weaponSplId, sortValue, updatedAt DESC,
		// buildId)` covering index below answers builds-by-weapon end-to-end.
		db.prepare(
			/* sql */ `alter table "BuildWeapon" add column "sortValue" integer`,
		).run();

		// Pass 1: tier*2 + 1 for public, NULL for private. Mirror Build.updatedAt.
		db.prepare(
			/* sql */ `
				update "BuildWeapon" set
					"updatedAt" = (select "updatedAt" from "Build" where "id" = "BuildWeapon"."buildId"),
					"sortValue" = (
						select case
							when "b"."private" = 1 then null
							else coalesce(
								(select "tier" from "PlusTier" where "userId" = "b"."ownerId"),
								4
							) * 2 + 1
						end
						from "Build" as "b"
						where "b"."id" = "BuildWeapon"."buildId"
					)
			`,
		).run();

		// Pass 2: subtract 1 where THIS weapon is top500 for the owner. Per-weapon,
		// not per-build, so a build with Luna Blaster + Blaster gets the crown only
		// on the weapon the owner actually placed with.
		db.prepare(
			/* sql */ `
				update "BuildWeapon" set "sortValue" = "sortValue" - 1
				where "sortValue" is not null
					and exists (
						select 1
						from "Build" as "b"
						inner join "SplatoonPlayer" as "sp" on "sp"."userId" = "b"."ownerId"
						inner join "XRankPlacement" as "xrp"
							on "xrp"."playerId" = "sp"."id"
							and "xrp"."weaponSplId" = "BuildWeapon"."weaponSplId"
						where "b"."id" = "BuildWeapon"."buildId"
					)
			`,
		).run();

		db.prepare(/* sql */ `drop index "idx_buildweapon_lookup"`).run();
		db.prepare(
			/* sql */ `drop index "build_weapon_weapon_spl_id_build_id"`,
		).run();

		// Canonicalize weaponSplId: alt skins collapse to their base weapon so
		// the builds-by-weapon and popular/stats queries can filter with a
		// single `= ?` against the covering index instead of an IN-list across
		// alt skins.
		db.prepare(
			/* sql */ `alter table "BuildWeapon" add column "canonicalWeaponSplId" integer`,
		).run();

		db.prepare(
			/* sql */ `
				update "BuildWeapon" set "canonicalWeaponSplId" = case "weaponSplId"
					when 45 then 40
					when 47 then 40
					when 46 then 41
					when 205 then 200
					when 1015 then 1010
					when 1115 then 1110
					when 2015 then 2010
					when 3005 then 3000
					when 4015 then 4010
					when 5015 then 5010
					when 6005 then 6000
					when 7015 then 7010
					when 8005 then 8000
					else "weaponSplId"
				end
			`,
		).run();

		// `updatedAt desc` matches the query's ORDER BY direction so the index
		// also covers the secondary sort — no temp B-tree.
		db.prepare(
			/* sql */ `create index build_weapon_lookup on "BuildWeapon"("canonicalWeaponSplId", "sortValue", "updatedAt" desc, "buildId")`,
		).run();

		// Drop dead schema: `BuildAbility` is fully replaced by `Build.abilities`
		// (JSON), `BuildAbilitySum` and `BuildWeaponAbility`. `BuildWeapon`'s
		// `isTop500` / `tier` are folded into `Build.sortValue` / `BuildWeapon.sortValue`.
		db.prepare(/* sql */ `drop table "BuildAbility"`).run();
		db.prepare(
			/* sql */ `alter table "BuildWeapon" drop column "isTop500"`,
		).run();
		db.prepare(/* sql */ `alter table "BuildWeapon" drop column "tier"`).run();

		db.pragma("foreign_key_check");
	})();
}

export function up(db) {
	db.pragma("foreign_keys = OFF");

	db.transaction(() => {
		db.prepare(`alter table "User" drop column "lastSubMessage"`).run();
		db.prepare(/* sql */ `alter table "User" add "shortBio" text`).run();
		db.prepare(/* sql */ `alter table "User" add "div" text`).run();
		db.prepare(
			/* sql */ `alter table "User" add "unverifiedPeakXP" text`,
		).run();
		// nullable: null means no explicit choice, the card derives a preset color from the user id
		db.prepare(/* sql */ `alter table "User" add "bannerPresetImg" text`).run();
		// supporter-uploaded banner (UserSubmittedImage id), takes precedence over bannerPresetImg
		db.prepare(/* sql */ `alter table "User" add "bannerImgId" integer`).run();
		// json array of card stat types the user has chosen to hide
		db.prepare(/* sql */ `alter table "User" add "hiddenCardStats" text`).run();

		// backfill unverifiedPeakXP from the existing "peak-xp-unverified" profile widget
		db.prepare(
			/* sql */ `
			update "User"
			set "unverifiedPeakXP" = (
				select json_object(
					'overall', json_extract(uw."widget", '$.settings.peakXp'),
					'tentatek', iif(json_extract(uw."widget", '$.settings.division') = 'tentatek', json_extract(uw."widget", '$.settings.peakXp'), null),
					'takoroka', iif(json_extract(uw."widget", '$.settings.division') = 'takoroka', json_extract(uw."widget", '$.settings.peakXp'), null)
				)
				from "UserWidget" uw
				where uw."userId" = "User"."id"
					and json_extract(uw."widget", '$.id') = 'peak-xp-unverified'
				limit 1
			)
			where exists (
				select 1 from "UserWidget" uw
				where uw."userId" = "User"."id"
					and json_extract(uw."widget", '$.id') = 'peak-xp-unverified'
			)
		`,
		).run();

		// rebuild SplatoonPlayer to change peakXp from a scalar (real) into the
		// denormalized PeakXP json shape. per-division peaks are resolved from XRankPlacement
		// (region 'WEST' = tentatek, otherwise takoroka), matching refreshAllPeakXp.
		db.prepare(
			/* sql */ `
			create table "SplatoonPlayer_new" (
				"id" integer primary key,
				"userId" integer unique,
				"splId" text unique not null,
				"peakXp" text,
				foreign key ("userId") references "User"("id") on delete cascade
			) strict
		`,
		).run();

		db.prepare(
			/* sql */ `
			insert into "SplatoonPlayer_new" ("id", "userId", "splId", "peakXp")
			select
				"id",
				"userId",
				"splId",
				iif("peakXp" is null, null, json_object(
					'overall', "peakXp",
					'takoroka', (
						select max("XRankPlacement"."power") from "XRankPlacement"
						where "XRankPlacement"."playerId" = "SplatoonPlayer"."id"
							and "XRankPlacement"."region" <> 'WEST'
					),
					'tentatek', (
						select max("XRankPlacement"."power") from "XRankPlacement"
						where "XRankPlacement"."playerId" = "SplatoonPlayer"."id"
							and "XRankPlacement"."region" = 'WEST'
					)
				))
			from "SplatoonPlayer"
		`,
		).run();

		db.prepare(/* sql */ `drop table "SplatoonPlayer"`).run();
		db.prepare(
			/* sql */ `alter table "SplatoonPlayer_new" rename to "SplatoonPlayer"`,
		).run();
		db.prepare(
			/* sql */ `create index splatoon_player_user_id on "SplatoonPlayer"("userId")`,
		).run();

		db.pragma("foreign_key_check");
	})();

	db.pragma("foreign_keys = ON");
}

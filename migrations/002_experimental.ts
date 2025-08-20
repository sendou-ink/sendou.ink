import { Kysely } from 'kysely'    
import * as MapPool from '$lib/core/maps/MapPool';
import * as R from 'remeda';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("Badge").dropColumn("hue").execute()
  await db.schema.alterTable("TournamentTeam").dropColumn("noScreen").execute()
  await db.schema.alterTable("TournamentTeam").dropColumn("prefersNotToHost").execute()

  await fixQWeaponPools(db);
  await fixUserMapModePreferences(db);

  await db.schema
    .createIndex('build_weapon_weapon_spl_id')
    .on('BuildWeapon')
    .column('weaponSplId')
    .execute();
}

async function fixQWeaponPools(db: Kysely<any>) {
const qWeaponPools = await db.selectFrom("User").select(["id", "qWeaponPool"]).where("qWeaponPool", "is not", null).execute();

for (const {qWeaponPool, id} of qWeaponPools) {
  await db.updateTable("User").set({
    qWeaponPool: JSON.stringify(JSON.parse(qWeaponPool).map(wp => ({
      id: wp.weaponSplId,
      isFavorite: Boolean(wp.isFavorite)
    })))
  }).where("id", "=", id).execute();
}
}

async function fixUserMapModePreferences(db: Kysely<any>) {
  const userMapModePreferences = await db.selectFrom("User").select(["id", "mapModePreferences"]).where("mapModePreferences", "is not", null).execute();

  for (const {mapModePreferences, id} of userMapModePreferences) {
    const mp = JSON.parse(mapModePreferences);

    console.log("mp", JSON.stringify(mp, null, 2));

    await db.updateTable("User").set({
      mapModePreferences: JSON.stringify({
        modes:
			mp.modes.flatMap((pref) =>
				pref.preference === 'PREFER' ? pref.mode : []
			) ?? [],
        pool: R.pipe(MapPool.fromSendouQMapPoolPreferences(mp), R.omitBy(R.isEmpty))
      })
    }).where("id", "=", id).execute();
  }
}

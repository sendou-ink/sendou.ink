import { Kysely } from 'kysely'    
// TODO: "Cannot find package '$lib' imported" - migrator doesn't understand the import
// import * as MapPool from '$lib/core/maps/MapPool';
// import * as R from 'remeda';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("Badge").dropColumn("hue").execute()
  await db.schema.alterTable("TournamentTeam").dropColumn("noScreen").execute()
  await db.schema.alterTable("TournamentTeam").dropColumn("prefersNotToHost").execute()

  await fixQWeaponPools(db);
  // await fixUserMapModePreferences(db);

  await db.schema
    .createIndex('build_weapon_weapon_spl_id')
    .on('BuildWeapon')
    .column('weaponSplId')
    .execute();

  // xxx: delete "TW" and "SZ" from calendar event tags

  // xxx: turn off all commissions open? to make sure all are recent for art

  await db.schema.alterTable("AllTeam").addColumn('tag', 'text').execute();
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

// async function fixUserMapModePreferences(db: Kysely<any>) {
//   const userMapModePreferences = await db.selectFrom("User").select(["id", "mapModePreferences"]).where("mapModePreferences", "is not", null).execute();

//   for (const {mapModePreferences, id} of userMapModePreferences) {
//     const mp = JSON.parse(mapModePreferences);

//     await db.updateTable("User").set({
//       mapModePreferences: JSON.stringify({
//         modes:
// 			mp.modes.flatMap((pref) =>
// 				pref.preference === 'PREFER' ? pref.mode : []
// 			) ?? [],
//         pool: R.pipe(MapPool.fromSendouQMapPoolPreferences(mp), R.omitBy(R.isEmpty))
//       })
//     }).where("id", "=", id).execute();
//   }
// }

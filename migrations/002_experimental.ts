import { Kysely } from 'kysely'    

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("Badge").dropColumn("hue").execute()
  await db.schema.alterTable("TournamentTeam").dropColumn("noScreen").execute()
  await db.schema.alterTable("TournamentTeam").dropColumn("prefersNotToHost").execute()

  await fixQWeaponPools(db);

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
    qWeaponPool: qWeaponPool ? JSON.stringify(JSON.parse(qWeaponPool).map(wp => ({
      id: wp.weaponSplId,
      isFavorite: Boolean(wp.isFavorite)
    }))) : null
  }).where("id", "=", id).execute();
}
}

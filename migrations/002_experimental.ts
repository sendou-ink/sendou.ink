import { Kysely } from 'kysely'    

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("Badge").dropColumn("hue").execute()
  await db.schema.alterTable("TournamentTeam").dropColumn("noScreen").execute()
  await db.schema.alterTable("TournamentTeam").dropColumn("prefersNotToHost").execute()

  await db.schema
    .createIndex('build_weapon_weapon_spl_id')
    .on('BuildWeapon')
    .column('weaponSplId')
    .execute();
}

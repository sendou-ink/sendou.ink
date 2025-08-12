import { Kysely } from 'kysely'
import fs from "node:fs";
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite';
    
const __dirname = dirname(fileURLToPath(import.meta.url));

// this migration contains all the changes made via ley (the old migrate library)

export async function up(db: Kysely<any>): Promise<void> {
  try {
    await db.selectFrom("User").select("id").limit(1).executeTakeFirst();

    console.log("Skipping initial migration, tables already exist");
  } catch (err) {
    if ((err instanceof Error) && err.message.includes("no such table")) {
      const schema = fs.readFileSync(path.join(__dirname, 'old-schema.sql'), 'utf-8');

      const sql = new DatabaseSync(process.env.DB_PATH!);
      sql.exec(schema);
    } else {


    throw err;
    }
  }
}

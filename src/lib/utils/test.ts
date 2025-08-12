/**
 * Resets all data in the database by deleting all rows from every table,
 * except for SQLite system tables and the 'migrations' table.
 *
 * @example
 * describe("My integration test", () => {
 *   beforeEach(async () => {
 *     await dbInsertUsers(2);
 *   });
 *
 *   afterEach(() => {
 *     dbReset();
 *   });
 *
 *   // tests go here
 * });
 */
export function dbReset() {
	return; // xxx: implement dbReset for unit tests
	// const tables = sql
	// 	.prepare(
	// 		"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'migrations';"
	// 	)
	// 	.all() as { name: string }[];

	// sql.prepare('PRAGMA foreign_keys = OFF').run();
	// for (const table of tables) {
	// 	sql.prepare(`DELETE FROM "${table.name}"`).run();
	// }
	// sql.prepare('PRAGMA foreign_keys = ON').run();
}

/**
 * Inserts a specified number of user records into the "User" table in the database for integration testing.
 * 1) id: 1, discordName: "user1", discordId: "0"
 * 2) id: 2, discordName: "user2", discordId: "1"
 * 3) etc.
 *
 * @param count - The number of users to insert. Defaults to 2 if not provided.
 *
 * @example
 * // Inserts 5 users into the database
 * await dbInsertUsers(5);
 *
 * // Inserts 2 users (default)
 * await dbInsertUsers();
 */
export function dbInsertUsers(_count = 2) {
	return; // xxx: implement dbInsertUsers for unit tests
	// return db
	// 	.insertInto('User')
	// 	.values(
	// 		Array.from({ length: count }).map((_, i) => ({
	// 			id: i + 1,
	// 			discordName: `user${i + 1}`,
	// 			discordId: String(i)
	// 		}))
	// 	)
	// 	.execute();
}

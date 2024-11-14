export function up(db) {
	db.transaction(() => {
		db.prepare(
			/*sql*/ `
    create table "SeedingSkill" (
      "mu" real not null,
      "sigma" real not null,
      "ordinal" real not null,
      "userId" integer not null,
      "type" text not null,
      foreign key ("userId") references "User"("id") on delete cascade,
      unique("userId", "type") on conflict replace 
    ) strict
    `,
		).run();
	})();
}

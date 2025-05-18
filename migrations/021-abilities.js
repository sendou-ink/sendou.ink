export function up(db) {
	db.prepare(
		/* sql */ `alter table "BuildAbility" add "abilityPoints" integer generated always as (case when "slotIndex" = 0 then 10 else 3 end) virtual`,
	).run();
}

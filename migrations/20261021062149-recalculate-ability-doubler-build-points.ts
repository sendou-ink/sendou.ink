import { type Kysely, sql } from "kysely";

const MAIN_SLOT_AP = 10;
const SUB_SLOT_AP = 3;
const MAIN_ONLY_ABILITIES = new Set([
	"OG",
	"LDE",
	"T",
	"CB",
	"NS",
	"H",
	"TI",
	"RP",
	"AD",
	"SJ",
	"OS",
	"DR",
]);

/**
 * Ability Doubler builds saved before their AP sums counted the doubling get them recalculated, mirrors `computeAbilitySums`.
 * `BuildWeapon` mirrors the build's owner so the builds-by-weapon list pages by author off covering indexes.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("BuildWeapon")
			.addColumn("ownerId", "integer", (col) => col.notNull().defaultTo(0))
			.execute();
		await sql`update "BuildWeapon" set "ownerId" = (select "ownerId" from "Build" where "Build"."id" = "BuildWeapon"."buildId")`.execute(
			trx,
		);

		await trx.schema.dropIndex("build_weapon_lookup").execute();
		await sql`create index build_weapon_lookup on "BuildWeapon" ("canonicalWeaponSplId", "sortValue", "updatedAt" desc, "buildId", "ownerId")`.execute(
			trx,
		);
		await sql`create index build_weapon_owner on "BuildWeapon" ("canonicalWeaponSplId", "ownerId", "sortValue", "updatedAt" desc, "buildId")`.execute(
			trx,
		);

		const builds = await trx
			.selectFrom("Build")
			.select(["id", "abilities", "abilitiesSignature"])
			.where("abilities", "like", '%"AD"%')
			.where("abilitiesSignature", "is not", null)
			.execute();

		for (const build of builds) {
			const sums = abilitySums(JSON.parse(build.abilities));
			const signature = serializeSignature(sums);
			if (signature === build.abilitiesSignature) continue;

			await trx
				.updateTable("Build")
				.set({ abilitiesSignature: signature })
				.where("id", "=", build.id)
				.execute();

			for (const [ability, abilityPoints] of sums) {
				for (const table of ["BuildAbilitySum", "BuildWeaponAbility"]) {
					await trx
						.updateTable(table)
						.set({ abilityPoints })
						.where("buildId", "=", build.id)
						.where("ability", "=", ability)
						.execute();
				}
			}
		}
	});
}

function abilitySums(abilities: string[][]) {
	const sums = new Map<string, number>();

	for (const row of abilities) {
		let abilityDoublerActive = false;
		for (const [i, ability] of row.entries()) {
			if (ability === "AD") abilityDoublerActive = true;
			if (MAIN_ONLY_ABILITIES.has(ability)) continue;

			const ap =
				(i === 0 ? MAIN_SLOT_AP : SUB_SLOT_AP) * (abilityDoublerActive ? 2 : 1);
			sums.set(ability, (sums.get(ability) ?? 0) + ap);
		}
	}

	for (const row of abilities) {
		const mainAbility = row[0];
		if (!MAIN_ONLY_ABILITIES.has(mainAbility)) continue;

		sums.set(mainAbility, (sums.get(mainAbility) ?? 0) + MAIN_SLOT_AP);
	}

	return [...sums.entries()];
}

function serializeSignature(sums: Array<[string, number]>) {
	return sums
		.slice()
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([ability, ap]) => `${ability}_${ap}`)
		.join(",");
}

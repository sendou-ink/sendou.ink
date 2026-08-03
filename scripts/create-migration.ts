import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION_FOLDER = fileURLToPath(
	new URL("../migrations", import.meta.url),
);

const TEMPLATE = `import type { Kysely } from "kysely";

/** TODO: describe what this migration changes */
export async function up(db: Kysely<any>): Promise<void> {
	// kysely does not wrap sqlite migrations in a transaction, so do it here
	await db.transaction().execute(async (trx) => {
		await trx.schema.alterTable("TODO").addColumn("TODO", "text").execute();
	});
}
`;

function main() {
	const description = toKebabCase(process.argv.slice(2).join(" "));
	if (!description) {
		throw new Error(
			'Missing migration description e.g. pnpm run migrate:new "add user pronouns"',
		);
	}

	const fileName = `${timestamp(new Date())}-${description}.ts`;
	const filePath = path.join(MIGRATION_FOLDER, fileName);

	if (fs.existsSync(filePath)) {
		throw new Error(`${fileName} already exists`);
	}

	fs.writeFileSync(filePath, TEMPLATE);

	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log(`Created migrations/${fileName}`);
}

/** Sortable UTC stamp, so two branches can never claim the same slot. */
function timestamp(date: Date) {
	const pad = (value: number) => String(value).padStart(2, "0");

	return [
		date.getUTCFullYear(),
		pad(date.getUTCMonth() + 1),
		pad(date.getUTCDate()),
		pad(date.getUTCHours()),
		pad(date.getUTCMinutes()),
		pad(date.getUTCSeconds()),
	].join("");
}

function toKebabCase(input: string) {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

try {
	main();
} catch (error) {
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.error((error as Error).message);
	process.exit(1);
}

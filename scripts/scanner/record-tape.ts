/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
/**
 * Records an event tape (app/features/scanner/tests/tape.ts) from the source
 * events of one or more scanner `Game data` zips, e.g. the games of one
 * session. Zips go through the same validation as `pnpm scanner:unpack-zip`.
 * To tape a video instead: `pnpm scanner:scan-vod <video> --tape <name>`.
 *
 * Usage: pnpm scanner:tape <name> "<description>" <game-data.zip>...
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { extractGameDataZip } from "../../app/features/scanner/node/game-data-zip.ts";
import * as Tape from "../../app/features/scanner/tests/tape.ts";

const [name, description, ...zipPaths] = process.argv.slice(2);
if (!name || !description || zipPaths.length === 0) {
	console.error(
		'usage: pnpm scanner:tape <name> "<description>" <game-data.zip>...',
	);
	process.exit(2);
}

const scratchDir = mkdtempSync(join(tmpdir(), "scanner-tape-"));
try {
	const events = zipPaths
		.flatMap((zipPath, index) => {
			const outDir = join(scratchDir, String(index));
			extractGameDataZip(zipPath, outDir);
			return JSON.parse(
				readFileSync(join(outDir, "events.json"), "utf8"),
			) as Tape.TapeEvent[];
		})
		.toSorted((a, b) => a.t - b.t);
	const path = Tape.save({
		name,
		description,
		source: zipPaths.map((zipPath) => basename(zipPath)).join(", "),
		events,
	});
	console.info(`wrote ${path} (${events.length} events)`);
	console.info(
		"next: pnpm exec vitest run app/features/scanner/tests/logic/match-builder-tapes.test.ts",
	);
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
} finally {
	rmSync(scratchDir, { recursive: true, force: true });
}

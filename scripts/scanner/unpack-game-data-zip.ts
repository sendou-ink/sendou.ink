/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
/**
 * Validates a scanner `Game data` zip sent in by a user and unpacks it into a
 * fresh directory. Exits non-zero with the reason when the zip is not exactly
 * what the scanner writes; never unzip such a file by other means.
 *
 * Usage: pnpm scanner:unpack-zip <game-data.zip> <new-output-dir>
 */
import { extractGameDataZip } from "../../app/features/scanner/node/game-data-zip.ts";

const [zipPath, outDir] = process.argv.slice(2);
if (!zipPath || !outDir) {
	console.error(
		"usage: pnpm scanner:unpack-zip <game-data.zip> <new-output-dir>",
	);
	process.exit(2);
}

try {
	const summary = extractGameDataZip(zipPath, outDir);
	console.info(`OK: unpacked into ${summary.outDir}`);
	console.info(
		`events: ${Object.entries(summary.eventCounts)
			.map(([type, count]) => `${type} ${count}`)
			.join(", ")} (${summary.eventsWithoutFrame} without a frame)`,
	);
	console.info("frames (folder → fixture dir, resolution, t, confidence):");
	for (const frame of summary.frames) {
		console.info(
			`  ${frame.frameFile} → tests/fixtures/${frame.fixtureDir}/  ${frame.width}x${frame.height}  t=${frame.t}  conf=${frame.confidence.toFixed(3)}`,
		);
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}

/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
/**
 * CLI harness: run the ScoreboardDetector over fixtures and print everything
 * it saw — gate result, parsed fields, per-field scores, top weapon candidates.
 *
 * Usage: pnpm scanner:fixtures [case-name-substring]
 */
import { loadOpenCV } from "../../app/features/scanner/core/cv";
import {
	createScoreboardDetector,
	type ScoreboardRowDebug,
} from "../../app/features/scanner/core/detectors/scoreboard/index";
import {
	loadFixtures,
	runDetectorOnFixture,
} from "../../app/features/scanner/node/fixtures";
import { loadScoreboardResources } from "../../app/features/scanner/node/resources";

const filter = process.argv[2];

await loadOpenCV();
const detector = createScoreboardDetector(await loadScoreboardResources());

const fixtures = loadFixtures("scoreboard").filter(
	(f) => !filter || f.name.includes(filter),
);
if (fixtures.length === 0) {
	console.error("no fixtures matched");
	process.exit(1);
}

for (const fixture of fixtures) {
	const { gate, events } = await runDetectorOnFixture(detector, fixture);
	console.info(`\n=== ${fixture.name}`);
	console.info(`gate: pass=${gate.pass} score=${gate.score.toFixed(3)}`);
	for (const event of events) {
		console.info(`event confidence=${event.confidence.toFixed(3)}`);
		console.info(`matchScores: ${JSON.stringify(event.data.matchScores)}`);
		const rows = (event.debug?.rows ?? []) as ScoreboardRowDebug[];
		event.data.players.forEach((p, i) => {
			const dbg = rows[i];
			const top = dbg?.weapon?.top
				.map((t) => `${t.id}:${t.score.toFixed(2)}`)
				.join(" ");
			console.info(
				`  row${i}: name="${p.name}"(${dbg?.nameScore.toFixed(2)}) ` +
					`weapon=${p.weaponId} [${top}] paint=${p.paint}(${dbg?.paintScore.toFixed(2)}) ` +
					`ka=${p.ka} d=${p.d} s=${p.s} statScores=${dbg?.statScores.map((s) => s.toFixed(2)).join(",")}`,
			);
		});
	}
}

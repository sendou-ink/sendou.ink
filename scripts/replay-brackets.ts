/**
 * Replays every finalized tournament through the bracket engine and reports where the replay and
 * the stored data disagree. Read-only.
 *
 * pnpm run replay:brackets                  every finalized tournament not yet in the results file
 * pnpm run replay:brackets --fresh          start the results file over
 * pnpm run replay:brackets --sample=200     a random sample (same tournaments every time)
 * pnpm run replay:brackets --id=4224        one tournament, every finding printed, nothing saved
 * pnpm run replay:brackets --report         only print the report of the results file
 * pnpm run replay:brackets --class=opponents  list the tournaments of one class in the report
 */
import fs from "node:fs";
import path from "node:path";
import { logger } from "~/utils/logger";
import { seededRandom } from "~/utils/random";
import * as Queries from "./replay-brackets/queries";
import { printReport } from "./replay-brackets/report";
import {
	replayTournament,
	type TournamentReplay,
} from "./replay-brackets/tournament-replay";

const RESULTS_PATH = path.join("scripts", "output", "replay-brackets.jsonl");
const SAMPLE_SEED = "replay-brackets";
const PROGRESS_INTERVAL = 500;

async function main() {
	const args = parseArgs(process.argv.slice(2));

	if (typeof args.id === "number") {
		const replay = await replayTournament(args.id);
		printReport([replay], { everyFinding: true });
		return;
	}

	if (args.fresh && fs.existsSync(RESULTS_PATH)) fs.rmSync(RESULTS_PATH);

	if (!args.report) {
		const done = new Set(readResults().map((replay) => replay.tournamentId));
		const all = await Queries.finalizedTournamentIds();
		const selected =
			typeof args.sample === "number"
				? seededRandom(SAMPLE_SEED)
						.seededShuffle(all)
						.slice(0, args.sample)
						.sort((a, b) => a - b)
				: all;
		const todo = selected.filter((tournamentId) => !done.has(tournamentId));

		logger.info(
			`Replaying ${todo.length} tournaments (${selected.length - todo.length} already in ${RESULTS_PATH})`,
		);

		const startedAt = performance.now();
		fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
		const output = fs.openSync(RESULTS_PATH, "a");
		for (const [i, tournamentId] of todo.entries()) {
			const replay = await replayTournament(tournamentId).catch(
				(error): TournamentReplay => ({
					tournamentId,
					stageCount: 0,
					matchCount: 0,
					findings: [],
					notes: {},
					error: String(error),
				}),
			);
			fs.writeSync(output, `${JSON.stringify(replay)}\n`);

			if ((i + 1) % PROGRESS_INTERVAL === 0) {
				logger.info(`${i + 1} / ${todo.length}`);
			}
		}
		fs.closeSync(output);

		logger.info(
			`Done in ${((performance.now() - startedAt) / 1000).toFixed(1)}s`,
		);
	}

	printReport(readResults(), { listClass: args.class });
}

function readResults(): TournamentReplay[] {
	if (!fs.existsSync(RESULTS_PATH)) return [];

	return fs
		.readFileSync(RESULTS_PATH, "utf8")
		.split("\n")
		.filter((line) => line.length > 0)
		.map((line) => JSON.parse(line));
}

function parseArgs(argv: string[]) {
	const value = (name: string) =>
		argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
	const number = (name: string) => {
		const raw = value(name);
		if (raw === undefined) return undefined;

		const parsed = Number(raw);
		if (!Number.isInteger(parsed) || parsed <= 0) {
			throw new Error(`--${name} must be a positive integer`);
		}
		return parsed;
	};

	return {
		id: number("id"),
		sample: number("sample"),
		class: value("class"),
		fresh: argv.includes("--fresh"),
		report: argv.includes("--report"),
	};
}

main().catch((error) => {
	logger.error(error);
	process.exit(1);
});

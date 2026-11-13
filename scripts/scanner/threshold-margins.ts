/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
/**
 * Threshold margin audit, the last section of pnpm scanner:report: every
 * detector runs over every fixture with the decision log on (core/decisions.ts),
 * and each threshold is listed with the fixture value nearest to it on the
 * passing and on the failing side, most fragile first. The ranking counts a
 * detector's decisions on its own screen's fixtures; what it measured on the
 * other detectors' fixtures is listed beside it.
 */
import { readdirSync } from "node:fs";
import * as Decisions from "../../app/features/scanner/core/decisions";
import { createAllDetectors } from "../../app/features/scanner/core/detectors/registry";
import type { ScoreboardResources } from "../../app/features/scanner/core/detectors/scoreboard/index";
import { normalizeFrame, toMat } from "../../app/features/scanner/core/image";
import {
	FIXTURES_DIR,
	type Fixture,
	loadFixtures,
} from "../../app/features/scanner/node/fixtures";
import { readImage } from "../../app/features/scanner/node/image-io";

interface FixtureSource {
	fixture: string;
	/** the detector deciding is the one the fixture's screen belongs to */
	ownScreen: boolean;
}

type FixtureSample = Decisions.DecisionSample & { source: FixtureSource };
type FixtureMargin = Decisions.DecisionMargin<FixtureSource>;

type FixtureEvent = Fixture["expected"]["event"];

const DETECTOR_ID_BY_FIXTURE_EVENT: Record<
	Exclude<FixtureEvent, "none">,
	string
> = {
	Scoreboard: "scoreboard",
	ScoreboardBattleLogReplay: "scoreboard-battle-log-replay",
	ScoreboardBattleLog: "scoreboard-battle-log",
	QuickScoreboardBattleLog: "quick-scoreboard-battle-log",
	ScoreboardOwn: "scoreboard-own",
	Death: "death",
	MapStart: "map-start",
	Minimap: "minimap",
	Objective: "objective",
	PlayerStatus: "objective",
	StripWeapons: "objective",
	Kill: "kill",
	XSetCount: "x-set-count",
	XSetResult: "x-set-result",
	XRankPosition: "x-rank-position",
};

export async function printThresholdMargins(
	resources: ScoreboardResources,
): Promise<void> {
	const samples = await recordFixtureDecisions(resources);
	const ownScreen = Decisions.margins(
		samples.filter((s) => s.source.ownScreen),
	);
	const otherScreens = new Map(
		Decisions.margins(samples.filter((s) => !s.source.ownScreen)).map(
			(margin) => [margin.id, margin],
		),
	);
	const ownScreenIds = new Set(ownScreen.map((margin) => margin.id));
	const unreached = [...otherScreens.values()].filter(
		(margin) => !ownScreenIds.has(margin.id),
	);

	console.info(
		`\n=== threshold margins (${ownScreen.length + unreached.length} thresholds, ${samples.length} decisions) ===`,
	);
	console.info(
		"nearest fixture value on each side of every threshold (pass = the comparison held), on the detector's own screen; sorted by the smaller margin as a share of the observed value span",
	);
	for (const margin of ownScreen) {
		printHeading(margin);
		console.info(`        pass ${formatSide(margin.passed)}`);
		console.info(`        fail ${formatSide(margin.failed)}`);
		const other = otherScreens.get(margin.id);
		if (other) printOtherScreens(other);
	}

	if (unreached.length === 0) return;
	console.info(
		"\n--- decided on other detectors' fixtures only (no fixture of the own screen reaches the decision) ---",
	);
	for (const margin of unreached) {
		printHeading(margin);
		printOtherScreens(margin);
	}
}

async function recordFixtureDecisions(
	resources: ScoreboardResources,
): Promise<FixtureSample[]> {
	const samples: FixtureSample[] = [];
	const fixtureDirs = readdirSync(FIXTURES_DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();

	for (const fixtureDir of fixtureDirs) {
		for (const fixture of loadFixtures(fixtureDir)) {
			const { event } = fixture.expected;
			const ownDetectorId =
				event === "none" ? null : DETECTOR_ID_BY_FIXTURE_EVENT[event];
			const source = {
				fixture: `${fixtureDir}/${fixture.name}`,
				ownScreen: true,
			};
			const src = toMat(await readImage(fixture.framePath));
			Decisions.setRecorder((sample) =>
				samples.push({ ...sample, source: { ...source } }),
			);
			try {
				const frame = normalizeFrame(src);
				// fresh detectors per fixture: memos and sticky fits must not carry
				// over between unrelated frames
				for (const detector of createAllDetectors(resources)) {
					source.ownScreen = detector.id === ownDetectorId;
					const gate = detector.gate(frame);
					if (gate.pass) detector.parse(frame, 0, gate);
				}
				frame.delete();
			} finally {
				Decisions.setRecorder(null);
				src.delete();
			}
		}
	}

	return samples;
}

function printHeading(margin: FixtureMargin): void {
	console.info(
		`\n${(100 * margin.relativeMargin).toFixed(1).padStart(5)}%  ${margin.id}  ${margin.op} ${margin.threshold === null ? "(derived)" : formatNumber(margin.threshold)}`,
	);
}

function printOtherScreens(margin: FixtureMargin): void {
	console.info(`        other screens pass ${formatSide(margin.passed)}`);
	console.info(`        other screens fail ${formatSide(margin.failed)}`);
}

function formatSide(side: FixtureMargin["passed"]): string {
	if (!side.nearest) return "never on any fixture";
	return `x${String(side.count).padEnd(6)} nearest ${formatNumber(side.nearest.value)} (${formatNumber(side.nearest.margin)} away)  ${side.nearest.source.fixture}`;
}

function formatNumber(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toPrecision(4);
}

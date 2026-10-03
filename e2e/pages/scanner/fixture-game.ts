import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCANNER_FIXTURES_DIR = path.join(
	__dirname,
	"../../../app/features/scanner/tests/fixtures",
);

/** Hand-labeled frames of one game, the Undertow Spillway Splat Zones match kera played. */
const FRAMES = {
	intro: "map-start/splat-zones-undertow-spillway/frame.png",
	results: "scoreboard/private-battle-splat-zones-ko-kera-2/frame.png",
} as const;

export type FixtureFrame = keyof typeof FRAMES;

/** What those frames show, per their expected.json; kera is the point of view player. */
export const FIXTURE_GAME = {
	mode: "Splat Zones",
	stage: "Undertow Spillway",
	stageId: 3,
	lobby: "Private Battle",
	score: "85–82",
	winners: ["Mongering", "y0s", "fuzzy", "kera"],
	losers: ["Cucumber", "Reefslider", "sigma", "tomato"],
	pov: { name: "kera", weapon: "Squeezer", ka: 15, d: 8, s: 2 },
	/** what the scanner's match card shows of it */
	card: [
		"Game 1",
		"Splat Zones",
		"Undertow Spillway",
		"WIN",
		"85–82",
		"15/8/2",
	],
} as const;

/** The frame's PNG on disk. */
export function fixtureFramePath(frame: FixtureFrame) {
	return path.join(SCANNER_FIXTURES_DIR, FRAMES[frame]);
}

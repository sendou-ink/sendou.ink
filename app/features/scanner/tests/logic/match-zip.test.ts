import { strFromU8, unzipSync } from "fflate";
import { describe, expect, test } from "vitest";
import { matchZip } from "../../components/match-zip";
import type { ScanEvent } from "../../components/session-data";
import type { ExportClip } from "../../core/csv/matches";
import type { DeathData } from "../../core/detectors/death/index";
import type { ScoreboardData } from "../../core/detectors/scoreboard/index";
import { buildScannerMatches } from "../../core/match-builder";

const WEBP_BYTES = new Uint8Array([1, 2, 3, 4]);
const PNG_BYTES = new Uint8Array([5, 6, 7]);

const mapStart: ScanEvent = {
	type: "MapStart",
	t: 100,
	confidence: 0.9,
	data: { mode: "SZ", stage: 0 },
};

const death: ScanEvent = {
	type: "Death",
	t: 162,
	confidence: 0.9,
	data: {
		weaponId: 40,
		weaponType: "MAIN",
		abilities: [["ISM", "ISS", "ISS", "ISS"]],
		name: "l1",
	} satisfies DeathData,
};

const scoreboard: ScanEvent = {
	type: "Scoreboard",
	t: 400,
	confidence: 0.9,
	data: {
		lobby: "PRIVATE",
		mode: "SZ",
		stage: 0,
		matchScores: [100, 47],
		povIndex: 0,
		players: ([40, 1001, 2010, 3030, 50, 210, 4010, 8000] as const).map(
			(weaponId, i) => ({
				name: `p${i}`,
				weaponId,
				paint: 1000,
				ka: 10,
				d: 5,
				s: 2,
			}),
		),
	} satisfies ScoreboardData,
};

const FRAMES = new Map<ScanEvent, Blob>([
	[death, new Blob([WEBP_BYTES], { type: "image/webp" })],
	[scoreboard, new Blob([PNG_BYTES], { type: "image/png" })],
]);

async function unzipMatch(clips: readonly ExportClip[] = []) {
	const [built] = buildScannerMatches([mapStart, death, scoreboard]);
	const zip = await matchZip(
		built!,
		(event) => {
			const frame = FRAMES.get(event);
			return frame ? () => Promise.resolve(frame) : undefined;
		},
		clips,
	);
	return unzipSync(zip);
}

describe("matchZip", () => {
	test("stores each frame byte for byte in a fixture folder named by order, type and game position", async () => {
		const files = await unzipMatch();

		expect(files["frames/002-Death-1m02s/frame.webp"]).toEqual(WEBP_BYTES);
		expect(files["frames/003-Scoreboard-5m00s/frame.png"]).toEqual(PNG_BYTES);
	});

	test("prefills each frame's expected.json from its event", async () => {
		const files = await unzipMatch();
		const expected = JSON.parse(
			strFromU8(files["frames/002-Death-1m02s/expected.json"]!),
		);

		expect(expected.event).toBe("Death");
		expect(expected.data.name).toBe("l1");
	});

	test("lists every source event with the folder of its frame", async () => {
		const files = await unzipMatch();
		const events = JSON.parse(strFromU8(files["events.json"]!));

		expect(
			events.map((event: { type: string; frame?: string }) => [
				event.type,
				event.frame ?? null,
			]),
		).toEqual([
			["MapStart", null],
			["Death", "frames/002-Death-1m02s"],
			["Scoreboard", "frames/003-Scoreboard-5m00s"],
		]);
	});

	test("includes the built match", async () => {
		const files = await unzipMatch();
		const match = JSON.parse(strFromU8(files["match.json"]!));

		expect(match.mode).toBe("SZ");
	});

	test("lists the game's clips chronologically in the built match", async () => {
		const files = await unzipMatch([
			{ kills: 3, start: 300, end: 325 },
			{ kills: 1, start: 160, end: 170 },
		]);
		const match = JSON.parse(strFromU8(files["match.json"]!));

		expect(match.clips).toEqual([
			{ kills: 1, start: 160, end: 170 },
			{ kills: 3, start: 300, end: 325 },
		]);
	});
});

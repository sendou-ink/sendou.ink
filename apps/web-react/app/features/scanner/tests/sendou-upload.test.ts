import assert from "node:assert/strict";
import { vodsNewSearchParams } from "~/features/vods/vods-search-params";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { sendouUpload } from "../components/sendou-upload";
import type { MinimapData } from "../core/detectors/minimap/index";
import type { ScoreboardData } from "../core/detectors/scoreboard/index";
import type { DetectedEvent } from "../core/detectors/types";
import test from "./node-test-compat";

const ALPHA: MainWeaponId[] = [40, 1001, 2010, 3030];
const BRAVO: MainWeaponId[] = [50, 210, 4010, 8000];

function scoreboard(t: number, povIndex: number | null): DetectedEvent {
	const data: ScoreboardData = {
		lobby: "PRIVATE",
		mode: "SZ",
		stage: 0,
		matchScores: [100, 47],
		players: [...ALPHA, ...BRAVO].map((weaponId, i) => ({
			name: `p${i}`,
			weaponId,
			paint: 1000,
			ka: 10,
			d: 5,
			s: 2,
		})),
		povIndex,
	};
	return { type: "Scoreboard", t, confidence: 0.9, data };
}

function prefilledMatches(events: DetectedEvent[]) {
	const { url } = sendouUpload(events);
	assert.ok(url);
	const { ingest } = vodsNewSearchParams.parse(
		new URL(url, "https://sendou.ink"),
	);
	assert.ok(ingest);
	return ingest.matches;
}

test("the pov seat's weapon is sent as the prefilled pov weapon", () => {
	const matches = prefilledMatches([scoreboard(300, 6)]);

	assert.equal(matches[0]!.povWeapon, BRAVO[2]);
});

test("no pov weapon is sent when no scoreboard identified the seat", () => {
	const matches = prefilledMatches([scoreboard(300, null)]);

	assert.equal(matches[0]!.povWeapon, undefined);
});

test("weapons are padded to 4 slots per team so uneven rosters keep the team split", () => {
	const data: MinimapData = {
		stage: 0,
		spectator: true,
		teammates: (["up", "left", "right"] as const).map((slot, i) => ({
			slot,
			name: null,
			weaponId: ALPHA[i]!,
			abilities: [],
			dead: false,
			specialReady: false,
		})),
		enemies: BRAVO.map((weaponId) => ({
			name: null,
			weaponId,
			abilities: [],
			dead: false,
			specialReady: false,
		})),
		teamColors: [null, null],
	};
	const matches = prefilledMatches([
		{ type: "Minimap", t: 300, confidence: 0.9, data },
	]);

	assert.deepEqual(matches[0]!.weapons, [...ALPHA.slice(0, 3), null, ...BRAVO]);
});

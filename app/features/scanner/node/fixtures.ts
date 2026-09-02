/**
 * Fixture discovery and detector execution for tests and tools. A fixture is a
 * directory under tests/fixtures/<detector>/<case-name>/ holding frame.png or
 * frame.jpg (raw capture, any resolution) and expected.json.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
	AbilityWithUnknown,
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type { ScoreboardData } from "../core/detectors/scoreboard/index";
import type {
	DetectedEvent,
	Detector,
	GateResult,
} from "../core/detectors/types";
import { normalizeFrame, toMat } from "../core/image";
import type { ScannerLobby } from "../scanner-types";
import { readImage } from "./image-io";

export const FIXTURES_DIR = new URL("../tests/fixtures", import.meta.url)
	.pathname;

interface ExpectedPlayer {
	name?: string;
	weaponId?: MainWeaponId | null;
	paint?: number;
	ka?: number;
	d?: number;
	s?: number;
}

interface ExpectedMinimapTeammate {
	slot?: "up" | "left" | "right" | "self" | "down";
	name?: string | null;
	/** informational for the human corrector; tests compare weaponId */
	weaponLabel?: string | null;
	weaponId?: MainWeaponId | null;
	abilities?: (AbilityWithUnknown | null)[];
	/** struck through with the respawn cross-out */
	dead?: boolean;
	/** on the light camo surface of a charged special */
	specialReady?: boolean;
}

interface ExpectedMinimapEnemy {
	/** spectator frames only: the screen shows bravo-team names */
	name?: string | null;
	/** informational for the human corrector; tests compare weaponId */
	weaponLabel?: string | null;
	weaponId?: MainWeaponId | null;
	abilities?: (AbilityWithUnknown | null)[];
	/** struck through with the respawn cross-out */
	dead?: boolean;
	/** on the light camo surface of a charged special */
	specialReady?: boolean;
}

interface ExpectedScoreboard {
	event:
		| "Scoreboard"
		| "ScoreboardBattleLogReplay"
		| "ScoreboardBattleLog"
		| "ScoreboardOwn"
		| "Death"
		| "MapStart"
		| "Minimap"
		| "Objective"
		| "PlayerStatus"
		| "StripWeapons"
		| "none";
	data?: {
		lobby?: ScannerLobby;
		mode?: ModeShort;
		stage?: StageId;
		/** informational for the human corrector; tests compare `stage` */
		stageLabel?: string;
		/** ScoreboardBattleLogReplay + ScoreboardBattleLog only */
		timestamp?: string;
		/** ScoreboardBattleLogReplay only */
		replayCode?: string;
		/** the "Score:" banner game scores, [winner, loser]; KO winner = 100 */
		matchScores?: [number | null, number | null];
		players?: ExpectedPlayer[];
		/** index of the yellow POV-arrow row in `players`; null = no arrow */
		povIndex?: number | null;
		/**
		 * Death: killer's weapon id and kind (ids are unique per kind). ScoreboardOwn:
		 * the player's own main (weaponType unused). weaponLabel is informational.
		 */
		weaponLabel?: string;
		weaponId?: number | null;
		weaponType?: "MAIN" | "SUB" | "SPECIAL";
		/** Death + ScoreboardOwn: 3 gear rows of [main, sub, sub, sub] ability ids */
		abilities?: AbilityWithUnknown[][];
		/** Death only: killer's splash-tag name */
		name?: string;
		/** Objective only: match-timer seconds ("3:35" = 215); null = unreadable */
		time?: number | null;
		/** Objective only: displayed counter per team, [alpha, bravo] */
		score?: [number | null, number | null];
		/** Objective only: penalty pill value per team; null = no pill */
		penalty?: [number | null, number | null];
		/** Objective only: which team currently holds the objective */
		control?: [boolean, boolean];
		/** PlayerStatus only: special held per slot, [left team, right team] */
		special?: [boolean[], boolean[]];
		/** PlayerStatus only: splatted per slot, [left team, right team] */
		dead?: [boolean[], boolean[]];
		/** PlayerStatus + StripWeapons: which icon-strip geometry the frame shows */
		layout?: "even" | "narrow-right" | "narrow-left";
		/** PlayerStatus only: white camera badges proved a casted spectator HUD */
		cast?: true | null;
		/** StripWeapons only: true weapon per slot, [left team, right team], null = splatted slot skipped */
		weapons?: [(MainWeaponId | null)[], (MainWeaponId | null)[]];
		weaponLabels?: [(string | null)[], (string | null)[]];
		/** Minimap only: casted 8-player spectator map screen (not parsed yet) */
		spectator?: boolean;
		/** Minimap only: own-team callout cards in slot order */
		teammates?: ExpectedMinimapTeammate[];
		/** Minimap only: enemy panel rows, top to bottom */
		enemies?: ExpectedMinimapEnemy[];
	};
	options?: {
		/** glob-ish field paths to skip, e.g. "players.*.name", "scores" */
		skipFields?: string[];
		/** free-form context for humans (why fields are skipped, capture quirks) */
		notes?: string;
	};
}

export interface Fixture {
	name: string;
	dir: string;
	framePath: string;
	expected: ExpectedScoreboard;
}

export function loadFixtures(detector: string): Fixture[] {
	const root = join(FIXTURES_DIR, detector);
	if (!existsSync(root)) return [];
	return readdirSync(root, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => {
			const dir = join(root, e.name);
			const framePath = ["frame.png", "frame.jpg", "frame.jpeg"]
				.map((f) => join(dir, f))
				.find(existsSync);
			if (!framePath) throw new Error(`fixture ${e.name}: no frame.png/jpg`);
			const expected = JSON.parse(
				readFileSync(join(dir, "expected.json"), "utf8"),
			) as ExpectedScoreboard;
			return { name: e.name, dir, framePath, expected };
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function isFieldSkipped(fixture: Fixture, field: string): boolean {
	const skips = fixture.expected.options?.skipFields ?? [];
	return skips.some((pattern) => {
		const re = new RegExp(
			`^${pattern
				.split("*")
				.map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
				.join("[^.]*")}$`,
		);
		return re.test(field);
	});
}

export interface FixtureRun<TData = ScoreboardData> {
	gate: GateResult;
	events: DetectedEvent<TData>[];
}

/** Run gate+parse the way the live pipeline would. Caller must have loaded OpenCV. */
export async function runDetectorOnFixture<TData = ScoreboardData>(
	detector: Detector<TData>,
	fixture: Fixture,
): Promise<FixtureRun<TData>> {
	const src = toMat(await readImage(fixture.framePath));
	const frame = normalizeFrame(src);
	src.delete();
	const gate = detector.gate(frame);
	const events = gate.pass ? detector.parse(frame, 0, gate) : [];
	frame.delete();
	return { gate, events };
}

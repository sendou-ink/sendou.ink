/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
/**
 * Accuracy report across all fixtures — separate from pass/fail testing.
 * Runs each detector over its own fixture directory and prints aggregate
 * per-field accuracy plus character error rate (CER) for names, the metric
 * that drives glyph atlas expansion.
 *
 * Usage: pnpm scanner:report
 */
import { loadOpenCV } from "../../app/features/scanner/core/cv";
import {
	createDeathDetector,
	type DeathData,
} from "../../app/features/scanner/core/detectors/death/index";
import {
	createMapStartDetector,
	type MapStartData,
} from "../../app/features/scanner/core/detectors/map-start/index";
import {
	createMinimapDetector,
	type MinimapData,
} from "../../app/features/scanner/core/detectors/minimap/index";
import { createScoreboardDetector } from "../../app/features/scanner/core/detectors/scoreboard/index";
import { createScoreboardBattleLogDetector } from "../../app/features/scanner/core/detectors/scoreboard-battle-log/index";
import {
	createScoreboardBattleLogReplayDetector,
	type ScoreboardBattleLogReplayData,
} from "../../app/features/scanner/core/detectors/scoreboard-battle-log-replay/index";
import {
	createScoreboardOwnDetector,
	type ScoreboardOwnData,
} from "../../app/features/scanner/core/detectors/scoreboard-own/index";
import type { Detector } from "../../app/features/scanner/core/detectors/types";
import {
	loadFixtures,
	runDetectorOnFixture,
} from "../../app/features/scanner/node/fixtures";
import { loadScoreboardResources } from "../../app/features/scanner/node/resources";

await loadOpenCV();
const resources = await loadScoreboardResources();

interface Config {
	label: string;
	detector: Detector<Partial<ScoreboardBattleLogReplayData>>;
	fixturesDir: string;
	event: string;
}

const configs: Config[] = [
	{
		label: "scoreboard",
		detector: createScoreboardDetector(resources),
		fixturesDir: "scoreboard",
		event: "Scoreboard",
	},
	{
		label: "scoreboard-battle-log-replay",
		detector: createScoreboardBattleLogReplayDetector(resources),
		fixturesDir: "scoreboard-battle-log-replay",
		event: "ScoreboardBattleLogReplay",
	},
	{
		label: "scoreboard-battle-log",
		detector: createScoreboardBattleLogDetector(resources),
		fixturesDir: "scoreboard-battle-log",
		event: "ScoreboardBattleLog",
	},
];

interface Tally {
	ok: number;
	total: number;
}

/** Levenshtein distance for CER. */
function editDistance(a: string, b: string): number {
	const dp = Array.from({ length: a.length + 1 }, (_, i) => {
		const row = new Array<number>(b.length + 1).fill(0);
		row[0] = i;
		return row;
	});
	for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			dp[i]![j] = Math.min(
				dp[i - 1]![j]! + 1,
				dp[i]![j - 1]! + 1,
				dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
		}
	}
	return dp[a.length]![b.length]!;
}

function pct(t: Tally): string {
	if (t.total === 0) return "     n/a";
	return `${((100 * t.ok) / t.total).toFixed(1).padStart(5)}% (${t.ok}/${t.total})`;
}

for (const config of configs) {
	// Shared negatives count toward gate accuracy (expectPositive is false).
	const fixtures = [
		...loadFixtures(config.fixturesDir),
		...loadFixtures("negative"),
	];

	const tally = {
		gate: { ok: 0, total: 0 } as Tally,
		header: { ok: 0, total: 0 } as Tally,
		timestamp: { ok: 0, total: 0 } as Tally,
		replayCode: { ok: 0, total: 0 } as Tally,
		matchScores: { ok: 0, total: 0 } as Tally,
		weapons: { ok: 0, total: 0 } as Tally,
		names: { ok: 0, total: 0 } as Tally,
		paint: { ok: 0, total: 0 } as Tally,
		stats: { ok: 0, total: 0 } as Tally,
	};
	let charEdits = 0;
	let charTotal = 0;
	const nameMisses: string[] = [];

	for (const fixture of fixtures) {
		const { gate, events } = await runDetectorOnFixture(
			config.detector,
			fixture,
		);
		const expectPositive = fixture.expected.event === config.event;
		tally.gate.total++;
		if (gate.pass === expectPositive) tally.gate.ok++;
		if (!expectPositive || !events[0]) continue;

		const event = events[0];
		const expected = fixture.expected.data ?? {};
		if (expected.mode !== undefined) {
			tally.header.total++;
			if (
				event.data.lobby === (expected.lobby ?? null) &&
				event.data.mode === (expected.mode ?? null) &&
				event.data.stage === (expected.stage ?? null)
			) {
				tally.header.ok++;
			}
		}
		if (expected.timestamp !== undefined) {
			tally.timestamp.total++;
			if (event.data.timestamp === expected.timestamp) tally.timestamp.ok++;
		}
		if (expected.replayCode !== undefined) {
			tally.replayCode.total++;
			if (event.data.replayCode === expected.replayCode) tally.replayCode.ok++;
		}
		if (expected.matchScores) {
			tally.matchScores.total++;
			if (
				JSON.stringify(event.data.matchScores) ===
				JSON.stringify(expected.matchScores)
			) {
				tally.matchScores.ok++;
			}
		}
		(expected.players ?? []).forEach((want, i) => {
			const got = event.data.players?.[i];
			if (!got) return;
			if (want.weaponId !== undefined) {
				tally.weapons.total++;
				if (got.weaponId === want.weaponId) tally.weapons.ok++;
			}
			if (want.name !== undefined) {
				tally.names.total++;
				const dist = editDistance(got.name, want.name);
				charEdits += dist;
				charTotal += want.name.length;
				if (dist === 0) tally.names.ok++;
				else
					nameMisses.push(
						`${fixture.name} row${i}: "${got.name}" != "${want.name}"`,
					);
			}
			if (want.paint !== undefined) {
				tally.paint.total++;
				if (got.paint === want.paint) tally.paint.ok++;
			}
			if (want.ka !== undefined) {
				tally.stats.total++;
				if (
					got.ka === want.ka &&
					got.d === (want.d ?? null) &&
					got.s === (want.s ?? null)
				) {
					tally.stats.ok++;
				}
			}
		});
	}

	console.info(`\n=== ${config.label} (${fixtures.length} fixtures) ===`);
	console.info(`gate        ${pct(tally.gate)}`);
	console.info(`header      ${pct(tally.header)}`);
	if (tally.timestamp.total > 0) {
		console.info(`timestamp   ${pct(tally.timestamp)}`);
	}
	if (tally.replayCode.total > 0) {
		console.info(`replayCode  ${pct(tally.replayCode)}`);
	}
	console.info(`matchScores ${pct(tally.matchScores)}`);
	console.info(`weapons     ${pct(tally.weapons)}`);
	console.info(`names       ${pct(tally.names)}`);
	console.info(`paint       ${pct(tally.paint)}`);
	console.info(`stats       ${pct(tally.stats)}`);
	console.info(
		`name CER    ${charTotal ? ((100 * charEdits) / charTotal).toFixed(2) : "n/a"}% (${charEdits} edits / ${charTotal} chars)`,
	);
	if (nameMisses.length > 0) {
		console.info("name misses:");
		for (const m of nameMisses) console.info(`  ${m}`);
	}
}

// Map-start fixtures only carry mode + stage, so they get their own pass.
{
	const detector = createMapStartDetector(resources);
	const fixtures = loadFixtures("map-start");
	const tally = {
		gate: { ok: 0, total: 0 } as Tally,
		mode: { ok: 0, total: 0 } as Tally,
		stage: { ok: 0, total: 0 } as Tally,
	};
	const misses: string[] = [];

	for (const fixture of fixtures) {
		const { gate, events } = await runDetectorOnFixture<MapStartData>(
			detector,
			fixture,
		);
		const expectPositive = fixture.expected.event === "MapStart";
		tally.gate.total++;
		if (gate.pass === expectPositive) tally.gate.ok++;
		if (!expectPositive || !events[0]) continue;
		const event = events[0];
		const expected = fixture.expected.data ?? {};
		if (expected.mode !== undefined) {
			tally.mode.total++;
			if (event.data.mode === expected.mode) tally.mode.ok++;
			else
				misses.push(
					`${fixture.name}: mode "${event.data.mode}" != "${expected.mode}"`,
				);
		}
		if (expected.stage !== undefined) {
			tally.stage.total++;
			if (event.data.stage === expected.stage) tally.stage.ok++;
			else
				misses.push(
					`${fixture.name}: stage "${event.data.stage}" != "${expected.stage}"`,
				);
		}
	}

	console.info(`\n=== map-start (${fixtures.length} fixtures) ===`);
	console.info(`gate        ${pct(tally.gate)}`);
	console.info(`mode        ${pct(tally.mode)}`);
	console.info(`stage       ${pct(tally.stage)}`);
	if (misses.length > 0) {
		console.info("misses:");
		for (const m of misses) console.info(`  ${m}`);
	}
}

// Scoreboard-own fixtures carry header + own weapon + ability grid.
{
	const detector = createScoreboardOwnDetector(resources);
	const fixtures = [
		...loadFixtures("scoreboard-own"),
		...loadFixtures("negative"),
	];
	const tally = {
		gate: { ok: 0, total: 0 } as Tally,
		header: { ok: 0, total: 0 } as Tally,
		weapon: { ok: 0, total: 0 } as Tally,
		abilities: { ok: 0, total: 0 } as Tally,
	};
	const misses: string[] = [];

	for (const fixture of fixtures) {
		const { gate, events } = await runDetectorOnFixture<ScoreboardOwnData>(
			detector,
			fixture,
		);
		const expectPositive = fixture.expected.event === "ScoreboardOwn";
		tally.gate.total++;
		if (gate.pass === expectPositive) tally.gate.ok++;
		if (!expectPositive || !events[0]) continue;
		const event = events[0];
		const expected = fixture.expected.data ?? {};
		if (expected.mode !== undefined) {
			tally.header.total++;
			if (
				event.data.lobby === (expected.lobby ?? null) &&
				event.data.mode === (expected.mode ?? null) &&
				event.data.stage === (expected.stage ?? null)
			) {
				tally.header.ok++;
			} else {
				misses.push(
					`${fixture.name}: header "${event.data.lobby}/${event.data.mode}/${event.data.stage}"`,
				);
			}
		}
		if (expected.weaponId !== undefined) {
			tally.weapon.total++;
			if (event.data.weaponId === expected.weaponId) tally.weapon.ok++;
			else
				misses.push(
					`${fixture.name}: weapon ${event.data.weaponId} != ${expected.weaponId} ("${expected.weaponLabel ?? ""}")`,
				);
		}
		(expected.abilities ?? []).forEach((wantRow, row) => {
			wantRow.forEach((want, slot) => {
				tally.abilities.total++;
				const got = event.data.abilities[row]?.[slot];
				if (got === want) tally.abilities.ok++;
				else
					misses.push(
						`${fixture.name}: ability [${row}][${slot}] "${got}" != "${want}"`,
					);
			});
		});
	}

	console.info(`\n=== scoreboard-own (${fixtures.length} fixtures) ===`);
	console.info(`gate        ${pct(tally.gate)}`);
	console.info(`header      ${pct(tally.header)}`);
	console.info(`weapon      ${pct(tally.weapon)}`);
	console.info(`abilities   ${pct(tally.abilities)}`);
	if (misses.length > 0) {
		console.info("misses:");
		for (const m of misses) console.info(`  ${m}`);
	}
}

// Minimap fixtures carry teammates/enemies, so they get their own pass.
{
	const detector = createMinimapDetector(resources);
	const fixtures = [...loadFixtures("minimap"), ...loadFixtures("negative")];
	const tally = {
		gate: { ok: 0, total: 0 } as Tally,
		weapons: { ok: 0, total: 0 } as Tally,
		names: { ok: 0, total: 0 } as Tally,
		abilities: { ok: 0, total: 0 } as Tally,
		stage: { ok: 0, total: 0 } as Tally,
		status: { ok: 0, total: 0 } as Tally,
	};
	let charEdits = 0;
	let charTotal = 0;
	const misses: string[] = [];

	for (const fixture of fixtures) {
		const { gate, events } = await runDetectorOnFixture<MinimapData>(
			detector,
			fixture,
		);
		const expectPositive = fixture.expected.event === "Minimap";
		tally.gate.total++;
		if (gate.pass === expectPositive) tally.gate.ok++;
		if (!expectPositive || !events[0]) continue;
		const event = events[0];
		const expected = fixture.expected.data ?? {};

		const sides: [
			string,
			{
				name?: string | null;
				weaponId?: number | null;
				abilities?: (string | null)[];
				dead?: boolean;
				specialReady?: boolean;
			}[],
			{
				name?: string | null;
				weaponId: number | null;
				abilities: (string | null)[];
				dead: boolean;
				specialReady: boolean;
			}[],
		][] = [
			["teammate", expected.teammates ?? [], event.data.teammates],
			["enemy", expected.enemies ?? [], event.data.enemies],
		];
		for (const [side, wants, gots] of sides) {
			wants.forEach((want, i) => {
				const got = gots[i];
				if (!got) return;
				if (want.weaponId !== undefined) {
					tally.weapons.total++;
					if (got.weaponId === want.weaponId) tally.weapons.ok++;
					else
						misses.push(
							`${fixture.name} ${side}${i}: weapon ${got.weaponId} != ${want.weaponId}`,
						);
				}
				if (want.name !== undefined && want.name !== null) {
					tally.names.total++;
					const gotName = got.name ?? "";
					const dist = editDistance(gotName, want.name);
					charEdits += dist;
					charTotal += want.name.length;
					if (dist === 0) tally.names.ok++;
					else
						misses.push(
							`${fixture.name} ${side}${i}: name "${gotName}" != "${want.name}"`,
						);
				}
				(want.abilities ?? []).forEach((wantId, slot) => {
					tally.abilities.total++;
					const gotId = got.abilities[slot] ?? null;
					if (gotId === wantId) tally.abilities.ok++;
					else
						misses.push(
							`${fixture.name} ${side}${i}: ability [${slot}] "${gotId}" != "${wantId}"`,
						);
				});
				for (const flag of ["dead", "specialReady"] as const) {
					if (want[flag] === undefined) continue;
					tally.status.total++;
					if (got[flag] === want[flag]) tally.status.ok++;
					else
						misses.push(
							`${fixture.name} ${side}${i}: ${flag} ${got[flag]} != ${want[flag]}`,
						);
				}
			});
		}
		if (expected.stage !== undefined) {
			tally.stage.total++;
			if (event.data.stage === expected.stage) tally.stage.ok++;
			else
				misses.push(
					`${fixture.name}: stage "${event.data.stage}" != "${expected.stage}"`,
				);
		}
	}

	console.info(`\n=== minimap (${fixtures.length} fixtures) ===`);
	console.info(`gate        ${pct(tally.gate)}`);
	console.info(`weapons     ${pct(tally.weapons)}`);
	console.info(`names       ${pct(tally.names)}`);
	console.info(`abilities   ${pct(tally.abilities)}`);
	console.info(`stage       ${pct(tally.stage)}`);
	console.info(`status      ${pct(tally.status)}`);
	console.info(
		`name CER    ${charTotal ? ((100 * charEdits) / charTotal).toFixed(2) : "n/a"}% (${charEdits} edits / ${charTotal} chars)`,
	);
	if (misses.length > 0) {
		console.info("misses:");
		for (const m of misses) console.info(`  ${m}`);
	}
}

// Death fixtures carry a different data shape (weapon text, ability grid,
// splash-tag name), so they get their own pass instead of a Config entry.
{
	const detector = createDeathDetector(resources);
	const fixtures = loadFixtures("death");
	const tally = {
		gate: { ok: 0, total: 0 } as Tally,
		weapon: { ok: 0, total: 0 } as Tally,
		abilities: { ok: 0, total: 0 } as Tally,
		names: { ok: 0, total: 0 } as Tally,
	};
	let charEdits = 0;
	let charTotal = 0;
	const misses: string[] = [];

	for (const fixture of fixtures) {
		const { gate, events } = await runDetectorOnFixture<DeathData>(
			detector,
			fixture,
		);
		const expectPositive = fixture.expected.event === "Death";
		tally.gate.total++;
		if (gate.pass === expectPositive) tally.gate.ok++;
		if (!expectPositive || !events[0]) continue;
		const event = events[0];
		const expected = fixture.expected.data ?? {};
		if (expected.weaponId !== undefined) {
			tally.weapon.total++;
			if (event.data.weaponId === expected.weaponId) tally.weapon.ok++;
			else
				misses.push(
					`${fixture.name}: weapon ${event.data.weaponId} != ${expected.weaponId} ("${expected.weaponLabel ?? ""}")`,
				);
		}
		(expected.abilities ?? []).forEach((wantRow, row) => {
			wantRow.forEach((want, slot) => {
				tally.abilities.total++;
				const got = event.data.abilities[row]?.[slot];
				if (got === want) tally.abilities.ok++;
				else
					misses.push(
						`${fixture.name}: ability [${row}][${slot}] "${got}" != "${want}"`,
					);
			});
		});
		if (expected.name !== undefined) {
			tally.names.total++;
			const got = event.data.name ?? "";
			const dist = editDistance(got, expected.name);
			charEdits += dist;
			charTotal += expected.name.length;
			if (dist === 0) tally.names.ok++;
			else misses.push(`${fixture.name}: name "${got}" != "${expected.name}"`);
		}
	}

	console.info(`\n=== death (${fixtures.length} fixtures) ===`);
	console.info(`gate        ${pct(tally.gate)}`);
	console.info(`weapon      ${pct(tally.weapon)}`);
	console.info(`abilities   ${pct(tally.abilities)}`);
	console.info(`names       ${pct(tally.names)}`);
	console.info(
		`name CER    ${charTotal ? ((100 * charEdits) / charTotal).toFixed(2) : "n/a"}% (${charEdits} edits / ${charTotal} chars)`,
	);
	if (misses.length > 0) {
		console.info("misses:");
		for (const m of misses) console.info(`  ${m}`);
	}
}

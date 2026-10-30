/**
 * Computes the weapon data `WeaponRoll` balances lobby weapon rolls with, from the SendouQ maps of
 * `db-sandbox.sqlite3`, and writes it to `app/features/lobbies/core/weapon-roll-data.json`.
 *
 * Weapon strength is a logistic regression over every map with a winner and at least one reported weapon:
 *
 *   log-odds(alpha wins) = intercept + b1 * (alpha's summed pre-match mu - bravo's)
 *                        + b2 * (weapons reported for alpha - for bravo)
 *                        + sum of alpha's weapon effects - sum of bravo's
 *
 * The mu term keeps good players picking meta weapons from counting as weapon strength, the reported count
 * term keeps winners reporting more often from making every weapon look strong. Each weapon has an all modes
 * effect plus a deviation per ranked mode, both pulled towards 0 (ridge) so rarely played weapons stay near
 * average. Maps are weighted down by age with a half-life, balance patches making old results less relevant.
 *
 * Usage: pnpm run weapon-roll:data [halfLifeDays=365]
 */

import { writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import * as R from "remeda";
import * as WeaponRoll from "~/features/lobbies/core/WeaponRoll";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import type { MainWeaponId, ModeShort } from "~/modules/in-game-lists/types";
import { canonicalWeaponSplId } from "~/modules/in-game-lists/weapon-ids";
import { logger } from "~/utils/logger";

const DB_PATH = "db-sandbox.sqlite3";
const OUTPUT_PATH = "app/features/lobbies/core/weapon-roll-data.json";

const HALF_LIFE_DAYS = Number(process.argv[2] ?? 365);

/** Ridge penalties, 1 / variance of the prior. Weapon effects are expected within about ±0.1 log-odds. */
const WEAPON_PENALTY = 400;
const MODE_DEVIATION_PENALTY = 400;

/** Divides the mu difference so its coefficient is in the same ballpark as the others. */
const MU_SCALE = 10;

const NEWTON_ITERATIONS = 8;
const HOLDOUT_SHARE = 0.1;

const db = new DatabaseSync(DB_PATH, { readOnly: true });

const maps = loadMaps();
const holdoutFrom = maps.length - Math.round(maps.length * HOLDOUT_SHARE);

const features = featureLayout(WeaponRoll.ROLLABLE_WEAPON_IDS);

logger.info(`${maps.length} maps, evaluating on the newest ${HOLDOUT_SHARE}`);
const skillOnly = fit(maps.slice(0, holdoutFrom), { withWeapons: false });
const weaponsFit = fit(maps.slice(0, holdoutFrom), { withWeapons: true });
const holdout = maps.slice(holdoutFrom);
logger.info(
	`holdout log loss: skill only ${logLoss(holdout, skillOnly.theta, false).toFixed(5)}, with weapons ${logLoss(holdout, weaponsFit.theta, true).toFixed(5)}`,
);

const final = fit(maps, { withWeapons: true });
const output = toData(final);

writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, "\t")}\n`);
logger.info(
	`b(mu) ${final.theta[1].toFixed(4)}, b(reported) ${final.theta[2].toFixed(4)}, wrote ${OUTPUT_PATH}`,
);
printExtremes(output);

interface MapRow {
	mode: ModeShort;
	alphaWon: boolean;
	weight: number;
	muDifference: number;
	/** +1 for alpha, -1 for bravo */
	weapons: Array<{ weaponId: MainWeaponId; sign: 1 | -1 }>;
}

function loadMaps(): MapRow[] {
	const sides = new Map<string, "A" | "B">();
	for (const row of db
		.prepare(
			/* sql */ `
			select gm.id as matchId, gmem.userId, case when gmem.groupId = gm.alphaGroupId then 'A' else 'B' end as side
			from GroupMatch gm
			join GroupMember gmem on gmem.groupId in (gm.alphaGroupId, gm.bravoGroupId)`,
		)
		.iterate() as Iterable<{
		matchId: number;
		userId: number;
		side: "A" | "B";
	}>) {
		sides.set(`${row.matchId}-${row.userId}`, row.side);
	}

	const muDifferences = new Map<number, number>();
	for (const row of db
		.prepare(
			/* sql */ `
			select groupMatchId, userId, coalesce(lag(mu) over (partition by userId, season order by id), mu) as preMu
			from Skill
			where userId is not null`,
		)
		.iterate() as Iterable<{
		groupMatchId: number | null;
		userId: number;
		preMu: number;
	}>) {
		if (row.groupMatchId === null) continue;
		const side = sides.get(`${row.groupMatchId}-${row.userId}`);
		if (!side) continue;

		muDifferences.set(
			row.groupMatchId,
			(muDifferences.get(row.groupMatchId) ?? 0) +
				(side === "A" ? row.preMu : -row.preMu),
		);
	}

	const weaponsByMap = new Map<string, MapRow["weapons"]>();
	for (const row of db
		.prepare(
			/* sql */ "select groupMatchId, mapIndex, userId, weaponSplId from ReportedWeapon where groupMatchId is not null",
		)
		.iterate() as Iterable<{
		groupMatchId: number;
		mapIndex: number;
		userId: number;
		weaponSplId: MainWeaponId;
	}>) {
		const side = sides.get(`${row.groupMatchId}-${row.userId}`);
		if (!side) continue;

		const key = `${row.groupMatchId}-${row.mapIndex}`;
		const weapons = weaponsByMap.get(key) ?? [];
		weapons.push({
			weaponId: canonicalWeaponSplId(row.weaponSplId),
			sign: side === "A" ? 1 : -1,
		});
		weaponsByMap.set(key, weapons);
	}

	const rows = db
		.prepare(
			/* sql */ `
			select gmm.matchId, gmm."index" as mapIndex, gmm.mode, gmm.winnerGroupId = gm.alphaGroupId as alphaWon, gm.createdAt
			from GroupMatchMap gmm
			join GroupMatch gm on gm.id = gmm.matchId
			where gmm.winnerGroupId is not null
			order by gm.createdAt, gmm."index"`,
		)
		.all() as Array<{
		matchId: number;
		mapIndex: number;
		mode: ModeShort;
		alphaWon: number;
		createdAt: number;
	}>;

	const newest = rows.at(-1)?.createdAt ?? 0;
	const result: MapRow[] = [];
	for (const row of rows) {
		const weapons = weaponsByMap.get(`${row.matchId}-${row.mapIndex}`);
		const muDifference = muDifferences.get(row.matchId);
		if (!weapons || muDifference === undefined) continue;

		const ageDays = (newest - row.createdAt) / (60 * 60 * 24);
		result.push({
			mode: row.mode,
			alphaWon: row.alphaWon === 1,
			weight: 0.5 ** (ageDays / HALF_LIFE_DAYS),
			muDifference,
			weapons,
		});
	}

	return result;
}

function featureLayout(weaponIds: MainWeaponId[]) {
	const weaponIndex = new Map(weaponIds.map((id, i) => [id, 3 + i]));
	const modeOffset = new Map(
		rankedModesShort.map((mode, i) => [
			mode as ModeShort,
			3 + weaponIds.length * (i + 1),
		]),
	);

	return {
		size: 3 + weaponIds.length * (1 + rankedModesShort.length),
		weaponIndex,
		modeOffset,
		penalties: (withWeapons: boolean) => {
			const penalties = new Float64Array(
				3 + weaponIds.length * (1 + rankedModesShort.length),
			);
			for (let i = 3; i < penalties.length; i++) {
				penalties[i] = !withWeapons
					? 1e9
					: i < 3 + weaponIds.length
						? WEAPON_PENALTY
						: MODE_DEVIATION_PENALTY;
			}
			return penalties;
		},
	};
}

function rowFeatures(row: MapRow, withWeapons: boolean) {
	const values = new Map<number, number>([
		[0, 1],
		[1, row.muDifference / MU_SCALE],
		[2, R.sum(row.weapons.map((weapon) => weapon.sign))],
	]);
	if (!withWeapons) return values;

	const modeOffset = features.modeOffset.get(row.mode);
	for (const { weaponId, sign } of row.weapons) {
		const index = features.weaponIndex.get(weaponId);
		if (index === undefined) continue;

		values.set(index, (values.get(index) ?? 0) + sign);
		if (modeOffset !== undefined) {
			const modeIndex = modeOffset + index - 3;
			values.set(modeIndex, (values.get(modeIndex) ?? 0) + sign);
		}
	}

	return values;
}

/** Ridge logistic regression by Newton's method, returning the coefficients and their covariance. */
function fit(rows: MapRow[], { withWeapons }: { withWeapons: boolean }) {
	const size = features.size;
	const penalties = features.penalties(withWeapons);
	const sparseRows = rows.map((row) => ({
		row,
		entries: [...rowFeatures(row, withWeapons)].filter(([, v]) => v !== 0),
	}));

	const theta = new Float64Array(size);
	let hessian = new Float64Array(size * size);
	for (let iteration = 0; iteration < NEWTON_ITERATIONS; iteration++) {
		const gradient = new Float64Array(size);
		hessian = new Float64Array(size * size);

		for (const { row, entries } of sparseRows) {
			let z = 0;
			for (const [i, v] of entries) z += theta[i] * v;
			const p = 1 / (1 + Math.exp(-z));
			const residual = row.weight * ((row.alphaWon ? 1 : 0) - p);
			const curvature = row.weight * p * (1 - p);

			for (const [i, vi] of entries) {
				gradient[i] += residual * vi;
				for (const [j, vj] of entries) {
					hessian[i * size + j] += curvature * vi * vj;
				}
			}
		}

		for (let i = 0; i < size; i++) {
			gradient[i] -= penalties[i] * theta[i];
			hessian[i * size + i] += penalties[i];
		}

		const step = choleskySolve(hessian, gradient, size);
		for (let i = 0; i < size; i++) theta[i] += step[i];
	}

	return { theta, covariance: choleskyInverse(hessian, size) };
}

function logLoss(rows: MapRow[], theta: Float64Array, withWeapons: boolean) {
	let loss = 0;
	for (const row of rows) {
		let z = 0;
		for (const [i, v] of rowFeatures(row, withWeapons)) z += theta[i] * v;
		const p = 1 / (1 + Math.exp(-z));
		loss -= Math.log(row.alphaWon ? p : 1 - p);
	}

	return loss / rows.length;
}

function toData({
	theta,
	covariance,
}: ReturnType<typeof fit>): WeaponRoll.WeaponRollData {
	const usage = new Map<MainWeaponId, number>();
	const shapes = new Map<string, number>();
	for (const row of maps) {
		for (const { weaponId } of row.weapons) {
			usage.set(weaponId, (usage.get(weaponId) ?? 0) + row.weight);
		}

		for (const sign of [1, -1]) {
			const team = row.weapons
				.filter((weapon) => weapon.sign === sign)
				.map((weapon) => weapon.weaponId);
			if (team.length !== 4) continue;

			const key = WeaponRoll.shapeKey(team);
			shapes.set(key, (shapes.get(key) ?? 0) + row.weight);
		}
	}
	const usageTotal = R.sum([...usage.values()]);
	const shapesTotal = R.sum([...shapes.values()]);

	// effects are only defined relative to each other, center them on the average reported weapon
	const center =
		R.sum(
			WeaponRoll.ROLLABLE_WEAPON_IDS.map(
				(weaponId) =>
					theta[features.weaponIndex.get(weaponId)!] *
					(usage.get(weaponId) ?? 0),
			),
		) / usageTotal;

	const weapons: WeaponRoll.WeaponRollData["weapons"] = {};
	for (const weaponId of WeaponRoll.ROLLABLE_WEAPON_IDS) {
		const index = features.weaponIndex.get(weaponId)!;
		const weaponUsage = (usage.get(weaponId) ?? 0) / usageTotal;
		if (weaponUsage === 0) continue;

		const byMode: WeaponRoll.WeaponRollData["weapons"][string]["byMode"] = {};
		for (const [mode, offset] of features.modeOffset) {
			const modeIndex = offset + index - 3;
			byMode[mode] = {
				strength: round(theta[index] + theta[modeIndex] - center),
				strengthSe: round(
					Math.sqrt(
						covariance[index * features.size + index] +
							covariance[modeIndex * features.size + modeIndex] +
							2 * covariance[index * features.size + modeIndex],
					),
				),
			};
		}

		weapons[weaponId] = {
			usage: round(weaponUsage),
			strength: round(theta[index] - center),
			strengthSe: round(Math.sqrt(covariance[index * features.size + index])),
			byMode,
		};
	}

	return {
		generatedAt: new Date().toISOString(),
		mapCount: maps.length,
		weapons,
		shapes: Object.fromEntries(
			[...shapes]
				.sort((a, b) => b[1] - a[1])
				.map(([key, weight]) => [key, round(weight / shapesTotal)]),
		),
	};
}

function printExtremes(data: WeaponRoll.WeaponRollData) {
	const sorted = Object.entries(data.weapons).sort(
		(a, b) => b[1].strength - a[1].strength,
	);
	const line = ([id, weapon]: (typeof sorted)[number]) =>
		`${id.padStart(5)} ${(weapon.strength * 100).toFixed(1).padStart(6)} ±${(weapon.strengthSe * 100).toFixed(1)} usage ${(weapon.usage * 100).toFixed(2)}%`;

	logger.info(`strongest:\n${sorted.slice(0, 10).map(line).join("\n")}`);
	logger.info(`weakest:\n${sorted.slice(-10).map(line).join("\n")}`);
	logger.info(`shapes: ${JSON.stringify(data.shapes)}`);
}

function choleskyDecompose(matrix: Float64Array, size: number) {
	const lower = new Float64Array(size * size);
	for (let i = 0; i < size; i++) {
		for (let j = 0; j <= i; j++) {
			let sum = matrix[i * size + j];
			for (let k = 0; k < j; k++)
				sum -= lower[i * size + k] * lower[j * size + k];
			lower[i * size + j] =
				i === j ? Math.sqrt(sum) : sum / lower[j * size + j];
		}
	}
	return lower;
}

function solveWithLower(lower: Float64Array, b: Float64Array, size: number) {
	const y = new Float64Array(size);
	for (let i = 0; i < size; i++) {
		let sum = b[i];
		for (let k = 0; k < i; k++) sum -= lower[i * size + k] * y[k];
		y[i] = sum / lower[i * size + i];
	}
	const x = new Float64Array(size);
	for (let i = size - 1; i >= 0; i--) {
		let sum = y[i];
		for (let k = i + 1; k < size; k++) sum -= lower[k * size + i] * x[k];
		x[i] = sum / lower[i * size + i];
	}
	return x;
}

function choleskySolve(matrix: Float64Array, b: Float64Array, size: number) {
	return solveWithLower(choleskyDecompose(matrix, size), b, size);
}

function choleskyInverse(matrix: Float64Array, size: number) {
	const lower = choleskyDecompose(matrix, size);
	const inverse = new Float64Array(size * size);
	for (let column = 0; column < size; column++) {
		const unit = new Float64Array(size);
		unit[column] = 1;
		const solved = solveWithLower(lower, unit, size);
		for (let row = 0; row < size; row++) {
			inverse[row * size + column] = solved[row];
		}
	}
	return inverse;
}

function round(value: number) {
	return Math.round(value * 100_000) / 100_000;
}

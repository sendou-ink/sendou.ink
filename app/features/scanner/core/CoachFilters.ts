/**
 * Coach mode's game filters: which of a scanned file's games stay in the
 * review, matched on what the scan read of them. Sides are told apart from the
 * POV team's view ("friendly" and "enemy"), so a game without a POV team (a
 * cast, a results screen without the POV seat) fails every side filter, as a
 * game whose value was never read fails that value's filter.
 */
import * as R from "remeda";
import { matchScoresFromObjective } from "~/components/objective-timeline-utils";
import { modesShort } from "~/modules/in-game-lists/modes";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { SCANNER_LOBBIES, type ScannerLobby } from "../scanner-types";
import * as CoachEvents from "./CoachEvents";
import { stageLabel } from "./labels";
import type { ScannerMatch, ScannerMatchPlayer } from "./scanner-match";
import { matchKey } from "./text";

/** the game score a knockout wins at */
const KO_SCORE = 100;

export interface Filters {
	/** match type, e.g. Private Battle or X Battle */
	lobby: ScannerLobby | null;
	mode: ModeShort | null;
	stage: StageId | null;
	/** true = knockouts only, false = games played to time only */
	knockout: boolean | null;
	friendlyWeapon: MainWeaponId | null;
	enemyWeapon: MainWeaponId | null;
	/** an in-game name, compared ignoring case, spaces and diacritics */
	friendlyName: string | null;
	enemyName: string | null;
}

export const DEFAULT_FILTERS: Filters = {
	lobby: null,
	mode: null,
	stage: null,
	knockout: null,
	friendlyWeapon: null,
	enemyWeapon: null,
	friendlyName: null,
	enemyName: null,
};

export interface Options {
	lobbies: ScannerLobby[];
	modes: ModeShort[];
	stages: StageId[];
	friendlyWeapons: MainWeaponId[];
	enemyWeapons: MainWeaponId[];
	friendlyNames: string[];
	enemyNames: string[];
}

/** Whether any filter is set. */
export function isActive(filters: Filters): boolean {
	return Object.values(filters).some((value) => value !== null);
}

/** Whether `match` passes every set filter. */
export function passes(match: ScannerMatch, filters: Filters): boolean {
	if (filters.lobby !== null && match.lobby !== filters.lobby) return false;
	if (filters.mode !== null && modeOf(match) !== filters.mode) return false;
	if (filters.stage !== null && match.stage !== filters.stage) return false;
	if (filters.knockout !== null && knockoutOf(match) !== filters.knockout) {
		return false;
	}

	const { friendlyWeapon, enemyWeapon, friendlyName, enemyName } = filters;
	if (
		[friendlyWeapon, enemyWeapon, friendlyName, enemyName].every(R.isNullish)
	) {
		return true;
	}
	const sides = sidesOf(match);
	if (!sides) return false;
	return (
		(friendlyWeapon === null || hasWeapon(sides.friendly, friendlyWeapon)) &&
		(enemyWeapon === null || hasWeapon(sides.enemy, enemyWeapon)) &&
		(friendlyName === null || hasName(sides.friendly, friendlyName)) &&
		(enemyName === null || hasName(sides.enemy, enemyName))
	);
}

/**
 * The values the filters can pick from: those read in at least one of
 * `matches`. Names are listed in their first read spelling, the POV player's
 * own left out of the friendly ones.
 */
export function options(matches: readonly ScannerMatch[]): Options {
	const sides = matches.map(sidesOf).filter(R.isNonNull);
	const friendly = sides.flatMap((side) => side.friendly);
	const enemy = sides.flatMap((side) => side.enemy);

	return {
		lobbies: SCANNER_LOBBIES.filter((lobby) =>
			matches.some((match) => match.lobby === lobby),
		),
		modes: modesShort.filter((mode) =>
			matches.some((match) => modeOf(match) === mode),
		),
		stages: R.unique(
			matches.map((match) => match.stage).filter(R.isNonNull),
		).sort((a, b) => (stageLabel(a) ?? "").localeCompare(stageLabel(b) ?? "")),
		friendlyWeapons: weaponsOf(friendly),
		enemyWeapons: weaponsOf(enemy),
		friendlyNames: namesOf(
			sides.flatMap((side) =>
				side.friendly.filter((player) => player !== side.pov),
			),
		),
		enemyNames: namesOf(enemy),
	};
}

/**
 * Whether the game ended in a knockout: a team reported 100 on the results
 * screen, else the objective counter ran out. Null when neither was read.
 */
export function knockoutOf(match: ScannerMatch): boolean | null {
	if (match.matchScores?.some((score) => score === KO_SCORE)) return true;
	const objectiveScores = matchScoresFromObjective(
		match.objective?.samples ?? [],
	);
	if (objectiveScores.some((score) => score === KO_SCORE)) return true;
	if (
		match.matchScores?.some((score) => score !== null) ||
		objectiveScores.some((score) => score !== null)
	) {
		return false;
	}
	return null;
}

interface Sides {
	friendly: ScannerMatchPlayer[];
	enemy: ScannerMatchPlayer[];
	pov: ScannerMatchPlayer | undefined;
}

function sidesOf(match: ScannerMatch): Sides | null {
	const povTeam = CoachEvents.povTeamOf(match);
	if (povTeam === null) return null;
	return {
		friendly: match.teams[povTeam].players,
		enemy: match.teams[povTeam === 0 ? 1 : 0].players,
		pov: match.pov
			? match.teams[match.pov.team].players[match.pov.index]
			: undefined,
	};
}

function modeOf(match: ScannerMatch): ModeShort | null {
	return match.mode ?? match.objective?.mode ?? null;
}

function hasWeapon(
	players: readonly ScannerMatchPlayer[],
	weaponId: MainWeaponId,
) {
	return players.some((player) => player.weaponId === weaponId);
}

function hasName(players: readonly ScannerMatchPlayer[], name: string) {
	const key = matchKey(name);
	return players.some(
		(player) => player.name !== null && matchKey(player.name) === key,
	);
}

function weaponsOf(players: readonly ScannerMatchPlayer[]): MainWeaponId[] {
	return R.unique(
		players.map((player) => player.weaponId).filter(R.isNonNull),
	).sort((a, b) => a - b);
}

function namesOf(players: readonly ScannerMatchPlayer[]): string[] {
	return R.uniqueBy(
		players
			.map((player) => player.name?.trim())
			.filter((name): name is string => Boolean(name)),
		matchKey,
	).sort((a, b) => a.localeCompare(b));
}

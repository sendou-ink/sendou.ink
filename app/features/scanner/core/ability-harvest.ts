/**
 * Connects death events to scoreboard players: a death overlay shows the
 * killer's splash-tag name, weapon and full gear-ability grid, so every death
 * reveals one enemy build. Deaths are attributed to the next scoreboard-type
 * event in the timeline and matched to a player row by name and weapon id.
 */

import type {
	AbilityWithUnknown,
	MainWeaponId,
} from "~/modules/in-game-lists/types";
import { DEATH_EVENT_TYPE, type DeathData } from "./detectors/death/index";
import { SCOREBOARD_EVENT_TYPES } from "./detectors/registry";
import type { ScoreboardData } from "./detectors/scoreboard/index";
import type { DetectedEvent } from "./detectors/types";

/** player row index (0-7) → [head, clothes, shoes] ability-id rows */
export type PlayerAbilityMap = Map<number, AbilityWithUnknown[][]>;

/** one build's three gear mains; null per slot nothing identified */
export type GearMains = (AbilityWithUnknown | null)[];

/** Any player row a read can be attributed against (scoreboard, minimap). */
interface HarvestablePlayer {
	name: string | null;
	weaponId: MainWeaponId | null;
}

/** A read revealing one player's build: a death overlay or a minimap card. */
interface BuildRead {
	name: string | null;
	/** the player's main weapon, or null when the read proves no main */
	weaponId: MainWeaponId | null;
}

/**
 * Matches a build read to a player row. Both signals are OCR output, so a
 * combined name+weapon hit wins, then a unique name hit, then a unique weapon
 * hit (two players on the same weapon with a misread name stay unattributed).
 */
function matchPlayer(
	players: readonly HarvestablePlayer[],
	read: BuildRead,
): number | null {
	const name = read.name?.trim().toLowerCase() || null;
	const indices = players.map((_, i) => i);
	const byName = name
		? indices.filter(
				(i) => (players[i]!.name ?? "").trim().toLowerCase() === name,
			)
		: [];
	const byWeapon =
		read.weaponId !== null
			? indices.filter((i) => players[i]!.weaponId === read.weaponId)
			: [];
	const both = byName.filter((i) => byWeapon.includes(i));
	if (both.length > 0) return both[0]!;
	if (byName.length === 1) return byName[0]!;
	if (byWeapon.length === 1) return byWeapon[0]!;
	return null;
}

/** Harvests the builds a match's deaths reveal, attributed to scoreboard player rows. */
export function harvestAbilities(
	players: readonly HarvestablePlayer[],
	deaths: readonly DeathData[],
): PlayerAbilityMap {
	const abilities: PlayerAbilityMap = new Map();
	for (const death of deaths) {
		if (death.abilities.length === 0) continue;
		const index = matchPlayer(players, deathRead(death));
		if (index !== null) abilities.set(index, death.abilities);
	}
	return abilities;
}

/** A death as a build read: a sub/special kill credit says nothing about the killer's main. */
function deathRead(death: DeathData): BuildRead {
	return {
		name: death.name,
		weaponId:
			death.weaponType === "MAIN"
				? (death.weaponId as MainWeaponId | null)
				: null,
	};
}

/**
 * Harvests the gear mains one side's minimap cards reveal (three mains only),
 * attributed like a death — refusing ambiguous reads. Cards come and go across
 * frames (cross-outs, absent slots), so each slot keeps its first badge.
 */
export function harvestCardMains(
	players: readonly HarvestablePlayer[],
	cards: readonly (BuildRead & { abilities: GearMains })[],
): Map<number, GearMains> {
	const mains = new Map<number, GearMains>();
	for (const card of cards) {
		if (card.abilities.length === 0) continue;
		const index = matchPlayer(players, card);
		if (index === null) continue;
		const known = mains.get(index) ?? [null, null, null];
		mains.set(
			index,
			known.map((ability, slot) => betterRead(ability, card.abilities[slot])),
		);
	}
	for (const [index, build] of mains) {
		if (build.every((ability) => ability === null)) mains.delete(index);
	}
	return mains;
}

function betterRead(
	known: AbilityWithUnknown | null,
	incoming: AbilityWithUnknown | null | undefined,
): AbilityWithUnknown | null {
	if (known !== null && known !== "UNKNOWN") return known;
	if (incoming !== null && incoming !== undefined && incoming !== "UNKNOWN") {
		return incoming;
	}
	return known ?? incoming ?? null;
}

/**
 * Per scoreboard/replay event, the abilities harvested from the deaths since the
 * previous scoreboard; keyed by event identity, absent when none attributed.
 */
export function connectAbilities(
	events: readonly DetectedEvent[],
): Map<DetectedEvent, PlayerAbilityMap> {
	const sorted = events.toSorted((a, b) => a.t - b.t);
	const result = new Map<DetectedEvent, PlayerAbilityMap>();
	let pendingDeaths: DeathData[] = [];
	for (const event of sorted) {
		if (event.type === DEATH_EVENT_TYPE) {
			pendingDeaths.push(event.data as DeathData);
		} else if (SCOREBOARD_EVENT_TYPES.includes(event.type)) {
			const players = (event.data as ScoreboardData).players;
			const abilities = harvestAbilities(players, pendingDeaths);
			if (abilities.size > 0) result.set(event, abilities);
			pendingDeaths = [];
		}
	}
	return result;
}

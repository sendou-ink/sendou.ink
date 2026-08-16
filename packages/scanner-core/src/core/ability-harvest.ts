/**
 * Connect death events to scoreboard players: a death overlay shows the
 * killer's splash-tag name, weapon, and full gear-ability grid, so every
 * death in a match reveals one enemy player's build. Deaths are attributed
 * to the next scoreboard-type event in the timeline (a match's deaths
 * always precede its results screen), and matched to a player row by name
 * and weapon id.
 */

import type {
	AbilityWithUnknown,
	MainWeaponId,
} from "@sendou/in-game-lists/types";
import { DEATH_EVENT_TYPE, type DeathData } from "./detectors/death/index";
import { SCOREBOARD_EVENT_TYPES } from "./detectors/registry";
import type { ScoreboardData } from "./detectors/scoreboard/index";
import type { DetectedEvent } from "./detectors/types";

/** player row index (0-7) → [head, clothes, shoes] ability-id rows */
export type PlayerAbilityMap = Map<number, AbilityWithUnknown[][]>;

/** Any player row a death can be attributed against (scoreboard, minimap). */
interface HarvestablePlayer {
	name: string | null;
	weaponId: MainWeaponId | null;
}

/**
 * Match a death's killer to a player row. Both signals are OCR output, so
 * neither is trusted alone unless it is unambiguous: a combined name+weapon
 * hit wins, then a unique name hit, then a unique weapon hit (two players on
 * the same weapon with a misread name stay unattributed).
 */
function matchPlayer(
	players: readonly HarvestablePlayer[],
	death: DeathData,
): number | null {
	const name = death.name?.trim().toLowerCase() || null;
	const indices = players.map((_, i) => i);
	const byName = name
		? indices.filter(
				(i) => (players[i]!.name ?? "").trim().toLowerCase() === name,
			)
		: [];
	// scoreboard rows carry main-weapon ids; a sub/special credit says
	// nothing about which main the killer holds
	const byWeapon =
		death.weaponId !== null && death.weaponType === "MAIN"
			? indices.filter((i) => players[i]!.weaponId === death.weaponId)
			: [];
	const both = byName.filter((i) => byWeapon.includes(i));
	if (both.length > 0) return both[0]!;
	if (byName.length === 1) return byName[0]!;
	if (byWeapon.length === 1) return byWeapon[0]!;
	return null;
}

/**
 * Harvest the builds one match's death events reveal: each death with a
 * readable ability grid is attributed to a scoreboard player row.
 */
export function harvestAbilities(
	players: readonly HarvestablePlayer[],
	deaths: readonly DeathData[],
): PlayerAbilityMap {
	const abilities: PlayerAbilityMap = new Map();
	for (const death of deaths) {
		if (death.abilities.length === 0) continue;
		const index = matchPlayer(players, death);
		if (index !== null) abilities.set(index, death.abilities);
	}
	return abilities;
}

/**
 * For each scoreboard/replay event, harvest abilities from the death events
 * since the previous scoreboard. Keyed by event object identity; events
 * without any attributed death are absent from the result.
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

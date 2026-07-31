import {
	IN_GAME_NAME,
	sanitizeInGameName,
} from "~/features/user-page/in-game-name";
import { abilities } from "~/modules/in-game-lists/abilities";
import {
	clothesGearIds,
	headGearIds,
	shoesGearIds,
} from "~/modules/in-game-lists/gear-ids";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type {
	Ability,
	BuildAbilitiesTuple,
	MainWeaponId,
	ModeWithStage,
} from "~/modules/in-game-lists/types";
import {
	canonicalWeaponSplId,
	mainWeaponIds,
} from "~/modules/in-game-lists/weapon-ids";
import invariant from "~/utils/invariant";
import { faker } from "./faker";

const STACKABLE_ABILITIES = abilities
	.filter((ability) => ability.type === "STACKABLE")
	.map((ability) => ability.name);

export function mainWeapon(): MainWeaponId {
	return faker.helpers.arrayElement(mainWeaponIds);
}

const CANONICAL_MAIN_WEAPON_IDS = mainWeaponIds.filter(
	(id) => canonicalWeaponSplId(id) === id,
);

/** `count` main weapons distinct down to their canonical id, e.g. a weapon pool or
 * a multi-weapon build's. */
export function mainWeapons(count: number): MainWeaponId[] {
	return faker.helpers.arrayElements(CANONICAL_MAIN_WEAPON_IDS, count);
}

/** The gear of a build: a head, clothes and shoes item. */
export function gear() {
	return {
		headGearSplId: faker.helpers.arrayElement(headGearIds),
		clothesGearSplId: faker.helpers.arrayElement(clothesGearIds),
		shoesGearSplId: faker.helpers.arrayElement(shoesGearIds),
	};
}

/**
 * An in-game name with its discriminator, e.g. `Agent 4#1859`. `name` is sanitized and
 * truncated the way the real thing is, so the result always passes `inGameNameIsValid`.
 */
export function inGameName(name = faker.person.firstName()): string {
	const discriminator = faker.string.alphanumeric({
		length: {
			min: IN_GAME_NAME.DISCRIMINATOR_MIN_LENGTH,
			max: IN_GAME_NAME.DISCRIMINATOR_MAX_LENGTH,
		},
		casing: "lower",
	});

	return `${sanitizedName(name)}#${discriminator}`;
}

/**
 * A map list of `count` maps, rotating through the ranked modes and never repeating
 * a stage, the way a real one looks. Callers add whatever `source` their domain uses.
 */
export function mapList(count: number): ModeWithStage[] {
	const stages = faker.helpers.arrayElements(stageIds, count);

	return stages.map((stageId, i) => ({
		mode: rankedModesShort[i % rankedModesShort.length],
		stageId,
	}));
}

/**
 * The abilities of a build: a main and three subs per gear slot. All of them are
 * stackable ones, which every slot allows.
 */
export function buildAbilities(): BuildAbilitiesTuple {
	return [gearAbilities(), gearAbilities(), gearAbilities()];
}

function sanitizedName(name: string): string {
	const characters = [...sanitizeInGameName(name)].slice(
		0,
		IN_GAME_NAME.NAME_MAX_LENGTH,
	);
	invariant(characters.length > 0, `No valid in-game name characters: ${name}`);

	return characters.join("");
}

function gearAbilities(): [Ability, Ability, Ability, Ability] {
	const draw = () => faker.helpers.arrayElement(STACKABLE_ABILITIES);

	return [draw(), draw(), draw(), draw()];
}

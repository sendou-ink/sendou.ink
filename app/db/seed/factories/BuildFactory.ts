import * as BuildRepository from "~/features/builds/BuildRepository.server";
import { modesShort } from "~/modules/in-game-lists/modes";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";
import * as SplatoonFaker from "../core/SplatoonFaker";

/**
 * Creates builds. `ownerId` is whose build it is. The ability and weapon rows every
 * build listing is read through are what the repository derives from `abilities` and
 * `weaponSplIds`; a multi-weapon build is `weaponSplIds` with more than one entry.
 */
const NO_GEAR = {
	headGearSplId: null,
	clothesGearSplId: null,
	shoesGearSplId: null,
};

export const { create, createMany } = defineFactory({
	defaults: () => ({
		title: faker.lorem.words(3),
		description: faker.number.float(1) < 0.4 ? faker.lorem.paragraph() : null,
		modes:
			faker.number.float(1) < 0.7
				? faker.helpers.arrayElements(modesShort, { min: 1, max: 3 })
				: null,
		...(faker.number.float(1) < 0.85 ? SplatoonFaker.gear() : NO_GEAR),
		weaponSplIds: SplatoonFaker.mainWeapons(
			faker.helpers.arrayElement([1, 1, 1, 1, 2, 2, 3, 4, 5]),
		),
		abilities: SplatoonFaker.buildAbilities(),
		isPrivate: 0 as const,
	}),
	insert: BuildRepository.insert,
});

import * as BuildRepository from "~/features/builds/BuildRepository.server";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";
import * as SplatoonFaker from "../core/SplatoonFaker";

/**
 * Creates builds. `ownerId` is whose build it is. Gear and modes are left empty, the
 * ability and weapon rows every build listing is read through being what the
 * repository derives from `abilities` and `weaponSplIds`.
 */
export const { create } = defineFactory({
	defaults: () => ({
		title: faker.lorem.words(3),
		description: null,
		modes: null,
		headGearSplId: null,
		clothesGearSplId: null,
		shoesGearSplId: null,
		weaponSplIds: [faker.helpers.arrayElement(mainWeaponIds)],
		abilities: SplatoonFaker.buildAbilities(),
		isPrivate: 0 as const,
	}),
	insert: BuildRepository.insert,
});

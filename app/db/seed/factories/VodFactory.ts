import * as VodRepository from "~/features/vods/VodRepository.server";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";
import * as SplatoonFaker from "../core/SplatoonFaker";

const PUBLISHED_ON = { day: 1, month: 0, year: 2024 };

/**
 * Creates vods. `submitterUserId` is who added it, `pov` whose point of view it is
 * from — a user, a plain name, or nobody at all for a cast. Defaults to one match on
 * a random map, the match and player rows every vod listing is read through being
 * what the repository derives from `matches`.
 */
export const { create, createMany } = defineFactory({
	defaults: ({ seq }) => ({
		title: faker.lorem.words(3),
		youtubeUrl: `https://www.youtube.com/watch?v=vod${seq}`,
		date: PUBLISHED_ON,
		type: "TOURNAMENT" as const,
		matches: [
			{
				...SplatoonFaker.mapList(1)[0],
				startsAt: "0:00",
				weapons: [SplatoonFaker.mainWeapon()],
			},
		],
		isValidated: true,
	}),
	insert: VodRepository.insert,
});

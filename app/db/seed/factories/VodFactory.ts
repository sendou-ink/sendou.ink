import * as VodRepository from "~/features/vods/VodRepository.server";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";
import * as SplatoonFaker from "../core/SplatoonFaker";

const PUBLISHED_ON = { day: 1, month: 0, year: 2024 };

/** `pov` is a user, a plain name, or nobody for a cast. The repository derives the match and player rows from `matches`. */
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

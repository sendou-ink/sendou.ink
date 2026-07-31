import { videoMatchTypes } from "~/features/vods/vods-constants";
import {
	secondsToHoursMinutesSecondString,
	youtubeIdToYoutubeUrl,
} from "~/features/vods/vods-utils";
import { faker } from "../core/faker";
import * as SplatoonFaker from "../core/SplatoonFaker";
import * as VodFactory from "../factories/VodFactory";
import type { SeededUsers } from "./users";

const VOD_COUNT = 6;
const REAL_YOUTUBE_ID = "M4aV-BQWlVg";

export async function seedVods(users: SeededUsers) {
	await VodFactory.create({
		type: "TOURNAMENT",
		youtubeUrl: youtubeIdToYoutubeUrl(REAL_YOUTUBE_ID),
		date: { day: 2, month: 2, year: 2023 },
		submitterUserId: users.nzapId,
		title: "LUTI Division X Tournament - ABBF (THRONE) vs. Ascension",
		pov: { type: "USER", userId: users.nzapId },
		matches: fakeMatches(7),
	});

	for (let i = 0; i < VOD_COUNT - 1; i++) {
		const type = videoMatchTypes[i % videoMatchTypes.length];
		const povUserId = faker.helpers.arrayElement(users.showcaseIds);

		await VodFactory.create({
			type,
			submitterUserId:
				i % 4 === 0
					? users.nzapId
					: faker.helpers.arrayElement(users.showcaseIds),
			date: {
				day: faker.number.int({ min: 1, max: 28 }),
				month: faker.number.int({ min: 0, max: 11 }),
				year: faker.helpers.arrayElement([2023, 2024, 2025]),
			},
			pov:
				type === "CAST"
					? undefined
					: faker.number.float(1) < 0.8
						? { type: "USER", userId: povUserId }
						: { type: "NAME", name: faker.person.firstName() },
			matches: fakeMatches(faker.helpers.arrayElement([3, 4, 5, 6])),
		});
	}
}

function fakeMatches(count: number) {
	let secondsAt = 13;

	return SplatoonFaker.mapList(count).map((map) => {
		const startsAt = secondsToHoursMinutesSecondString(secondsAt);
		secondsAt += faker.number.int({ min: 180, max: 500 });

		return {
			...map,
			startsAt,
			weapons: SplatoonFaker.mainWeapons(faker.number.float(1) < 0.3 ? 8 : 1),
		};
	});
}

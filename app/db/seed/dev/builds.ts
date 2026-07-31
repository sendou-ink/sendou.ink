import { faker } from "../core/faker";
import * as showcaseNames from "../core/showcaseNames";
import * as BuildFactory from "../factories/BuildFactory";
import type { SeededUsers } from "./users";

const NZAP_BUILD_COUNT = 50;
const SPLATTERSHOT_ID = 40;
const ONE_WEAPON_BUILD_COUNT = 40;
const BUILD_HEAVY_USER_COUNT = 3;
const BUILDS_PER_HEAVY_USER = 32;
const CROWD_BUILD_COUNT = 360;

// xxx: maybe some private builds too?
export async function seedBuilds(users: SeededUsers) {
	await BuildFactory.createMany(NZAP_BUILD_COUNT, () => ({
		ownerId: users.nzapId,
		// xxx: weird slice
		title: showcaseNames.buildTitle().slice(0, 50),
	}));

	// one weapon with builds from many users, so its weapon page paginates
	const splattershotOwners = faker.helpers.arrayElements(
		[...users.showcaseIds, ...users.crowdIds],
		ONE_WEAPON_BUILD_COUNT,
	);
	for (const ownerId of splattershotOwners) {
		await BuildFactory.create({
			ownerId,
			weaponSplIds: [SPLATTERSHOT_ID],
		});
	}

	for (const ownerId of users.showcaseIds.slice(0, BUILD_HEAVY_USER_COUNT)) {
		await BuildFactory.createMany(BUILDS_PER_HEAVY_USER, (i) => ({
			ownerId,
			// xxx: weird slice
			title: showcaseNames.buildTitle().slice(0, 50),
			isPrivate: i % 8 === 0 ? (1 as const) : (0 as const),
		}));
	}

	for (let i = 0; i < CROWD_BUILD_COUNT; i++) {
		await BuildFactory.create({
			ownerId: faker.helpers.arrayElement([
				...users.showcaseIds,
				...users.crowdIds,
			]),
			isPrivate: faker.number.float(1) < 0.05 ? (1 as const) : (0 as const),
		});
	}
}

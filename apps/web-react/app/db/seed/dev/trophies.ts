import * as TrophyRepository from "~/features/trophies/TrophyRepository.server";
import {
	SUPPORTER_TROPHY_CODE,
	XP_TROPHY_CODE_PREFIX,
} from "~/features/trophies/trophies-constants";
import { faker } from "../core/faker";
import trophies from "../data/trophies.json";
import * as TrophyFactory from "../factories/TrophyFactory";
import type { SeededOrganization } from "./organizations";
import type { SeededUsers } from "./users";

const PENDING_COUNT = 5;
const PARTIALLY_APPROVED_COUNT = 2;
const ACCEPTED_COUNT = 3;
const DECLINED_COUNT = 3;

export type SeededTrophies = {
	/** Ids of the trophies tournaments can be given as a prize. */
	ids: number[];
};

export async function seedTrophies({
	users,
	organizations,
}: {
	users: SeededUsers;
	organizations: SeededOrganization[];
}): Promise<SeededTrophies> {
	const ids: number[] = [];
	for (const [name, model] of Object.entries(trophies)) {
		const trophy = await TrophyFactory.create({
			name,
			model,
			organizationId: organizations[0]?.id ?? null,
			creatorId: users.adminId,
			managerId: users.nzapId,
		});

		ids.push(trophy.id);
	}

	await seedPendingTrophies({ users, organizations });

	return { ids };
}

/**
 * Creates the trophies awarded off something other than a tournament win and hands
 * them to everybody eligible, as the nightly sync does. Runs last of the seed: who
 * is eligible follows from the patrons and X Rank placements seeded before it.
 */
export async function seedSpecialTrophies() {
	const models = TrophyFactory.MODELS;

	await TrophyFactory.create({
		name: "Supporter",
		model: models[0],
		code: SUPPORTER_TROPHY_CODE,
	});
	await TrophyFactory.create({
		name: "3000 X Power",
		model: models[1],
		code: `${XP_TROPHY_CODE_PREFIX}3000`,
	});
	await TrophyFactory.create({
		name: "2600 X Power",
		model: models[2],
		code: `${XP_TROPHY_CODE_PREFIX}2600`,
	});

	await TrophyRepository.syncSpecialTrophies();
}

async function seedPendingTrophies({
	users,
	organizations,
}: {
	users: SeededUsers;
	organizations: SeededOrganization[];
}) {
	const organizationId = organizations[0].id;
	const submitterIds = users.showcaseIds.slice(0, 10);
	const submission = (index: number) => ({
		organizationId,
		submitterUserId: faker.helpers.arrayElement(submitterIds),
		description: faker.lorem.sentence(),
		name: `Pending trophy ${index + 1}`,
	});

	await TrophyFactory.createManyPending(PENDING_COUNT, (index) =>
		submission(index),
	);

	await TrophyFactory.createManyPending(
		PARTIALLY_APPROVED_COUNT,
		(index) => ({
			...submission(index),
			name: `Partially approved trophy ${index + 1}`,
		}),
		{ approverUserIds: [users.adminId] },
	);

	await TrophyFactory.createManyPending(
		ACCEPTED_COUNT,
		(index) => ({
			...submission(index),
			name: `Accepted trophy ${index + 1}`,
		}),
		{ approverUserIds: [users.adminId, users.staffId, users.orgAdminId] },
	);

	await TrophyFactory.createManyPending(
		DECLINED_COUNT,
		(index) => ({
			...submission(index),
			name: `Declined trophy ${index + 1}`,
		}),
		{
			declinedBy: {
				userId: users.adminId,
				reason: faker.lorem.sentence(),
			},
		},
	);
}

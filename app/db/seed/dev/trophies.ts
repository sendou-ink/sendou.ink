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

/** X Power trophies handed to everybody eligible like the X Rank placement import does. Runs last: eligibility follows from X Rank placements. */
export async function seedSpecialTrophies() {
	await TrophyFactory.createXpTrophies();
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

	await TrophyFactory.createManySubmissions(PENDING_COUNT, (index) =>
		submission(index),
	);

	await TrophyFactory.createManySubmissions(
		PARTIALLY_APPROVED_COUNT,
		(index) => ({
			...submission(index),
			name: `Partially approved trophy ${index + 1}`,
		}),
		{ approverUserIds: [users.adminId] },
	);

	await TrophyFactory.createManySubmissions(
		ACCEPTED_COUNT,
		(index) => ({
			...submission(index),
			name: `Accepted trophy ${index + 1}`,
		}),
		{ approverUserIds: [users.adminId, users.staffId, users.orgAdminId] },
	);

	await TrophyFactory.createManySubmissions(
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

import { BADGE } from "~/features/badges/badges-constants";
import { faker } from "../core/faker";
import badges from "../data/badges.json";
import * as BadgeFactory from "../factories/BadgeFactory";
import * as UserFactory from "../factories/UserFactory";
import type { SeededUsers } from "./users";

const HOMEMADE_BADGE_COUNT = 5;
const NZAP_BADGE_COUNT = 20;
const ADMIN_BADGE_COUNT = 3;
const NZAP_FAVORITE_BADGE_COUNT = BADGE.SMALL_BADGES_PER_DISPLAY_PAGE + 1;
const MANY_OWNERS_COUNT = 60;
const MANY_BADGES_USER_BADGE_COUNT = 25;

export type SeededBadges = {
	ids: number[];
};

export async function seedBadges(users: SeededUsers): Promise<SeededBadges> {
	const ownableUserIds = [
		...users.showcaseIds,
		...users.showcaseIds,
		...users.crowdIds,
	];
	const manyBadgesUserId = users.favoriteBadgeUserIds[0];

	const ids: number[] = [];
	for (const [i, badge] of badges.entries()) {
		const created = await BadgeFactory.create(
			{
				code: badge.code,
				displayName: badge.displayName,
				hue: badge.hue,
				authorId: i < HOMEMADE_BADGE_COUNT ? users.adminId : null,
			},
			{
				ownerIds: fakeOwnerIds({
					index: i,
					users,
					ownableUserIds,
					manyBadgesUserId,
				}),
				managerIds:
					i < HOMEMADE_BADGE_COUNT
						? [users.adminId]
						: i < 10
							? [users.nzapId]
							: undefined,
			},
		);

		ids.push(created.id);
	}

	await seedFavoriteBadges(users, ids);

	return { ids };
}

function fakeOwnerIds({
	index,
	users,
	ownableUserIds,
	manyBadgesUserId,
}: {
	index: number;
	users: SeededUsers;
	ownableUserIds: number[];
	manyBadgesUserId: number;
}) {
	const ownerIds = faker.helpers.arrayElements(
		ownableUserIds,
		index === 0 ? MANY_OWNERS_COUNT : faker.number.int({ min: 1, max: 24 }),
	);

	if (index < NZAP_BADGE_COUNT) {
		ownerIds.push(users.nzapId);
	}

	if (index < ADMIN_BADGE_COUNT) {
		ownerIds.push(users.adminId);
	}

	if (index < MANY_BADGES_USER_BADGE_COUNT) {
		ownerIds.push(manyBadgesUserId);
	}

	// favorite badges are picked from the first few, so their pickers own them
	if (index < 3) {
		ownerIds.push(...users.favoriteBadgeUserIds);
	}

	return [...new Set(ownerIds)];
}

async function seedFavoriteBadges(users: SeededUsers, badgeIds: number[]) {
	for (const [i, userId] of users.favoriteBadgeUserIds.entries()) {
		await UserFactory.updateProfile(userId, {
			favoriteBadgeIds: [badgeIds[i % 3]],
		});
	}

	// a supporter picks a whole row of small badges alongside the big one
	await UserFactory.updateProfile(users.nzapId, {
		favoriteBadgeIds: badgeIds.slice(0, NZAP_FAVORITE_BADGE_COUNT),
	});
}

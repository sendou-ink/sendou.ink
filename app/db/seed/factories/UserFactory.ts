import { ADMIN_ID } from "~/features/admin/admin-constants";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import invariant from "~/utils/invariant";
import { REGULAR_USER_TEST_ID } from "../constants";
import { defineFactory } from "../core/defineFactory";
import { faker, unique } from "../core/faker";
import { pinUserId } from "../core/pinUserId";

type UpsertArgs = Parameters<typeof UserRepository.upsert>[0];

/** Creates users. Columns outside `UserRepository.upsert` (profile fields, patron
 * status, plus tier) are set by the repository function that owns them. */
export const { create, createMany } = defineFactory({
	defaults: ({ seq }) => ({
		discordId: String(seq),
		discordName: unique(() => faker.internet.username()),
		discordUniqueName: null,
		discordAvatar: null,
		twitch: null,
		youtubeId: null,
		bsky: null,
	}),
	insert: UserRepository.upsert,
});

/**
 * Creates the admin user, on the id the app's permission logic treats as an admin.
 * Also who `wrappedAction({ user: "admin" })` submits as.
 *
 * Has to be created before any other user, see {@link pinUserId}.
 */
export async function createAdmin(overrides?: Partial<UpsertArgs>) {
	const user = await create(overrides);

	return { id: await pinUserId(user.id, ADMIN_ID) };
}

/**
 * Creates the user that `wrappedAction({ user: "regular" })` submits as. Has no
 * permissions of any kind; use for the "somebody else" side of a permission test.
 *
 * Has to be created before any user without a pinned id, see {@link pinUserId}.
 */
export async function createRegular(overrides?: Partial<UpsertArgs>) {
	const user = await create(overrides);

	return { id: await pinUserId(user.id, REGULAR_USER_TEST_ID) };
}

/**
 * A set of interchangeable users referred to by the order they were created in.
 * For tests needing more users than it makes sense to give names to; prefer
 * destructuring `createMany` into named users when there are only a few.
 *
 * @example
 * const users = UserFactory.pool();
 *
 * beforeEach(async () => {
 *   await users.create(20);
 * });
 *
 * test("notifies both", () => notify({ userIds: [users.id(1), users.id(2)] }));
 */
export function pool() {
	let created: Array<{ id: number }> = [];

	return {
		/** Creates `count` users, replacing the ones the pool held before. */
		create: async (...args: Parameters<typeof createMany>) => {
			created = await createMany(...args);
		},
		/** Id of the `position`th user of the pool, counting from one. */
		id: (position: number) => {
			const user = created[position - 1];
			invariant(user, `No user at position ${position} in the pool`);

			return user.id;
		},
		/** Ids of the first `count` users of the pool, all of them by default. */
		ids: (count = created.length) => {
			invariant(
				created.length >= count,
				`Pool has ${created.length} users, ${count} asked for`,
			);

			return created.slice(0, count).map((user) => user.id);
		},
	};
}

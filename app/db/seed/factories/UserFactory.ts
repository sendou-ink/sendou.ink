import { ADMIN_ID } from "~/features/admin/admin-constants";
import * as UserRepository from "~/features/user-page/UserRepository.server";
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

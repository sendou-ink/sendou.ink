import { add } from "date-fns";
import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import * as AdminRepository from "~/features/admin/AdminRepository.server";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import invariant from "~/utils/invariant";
import { REGULAR_USER_TEST_ID } from "../constants";
import { defineFactory } from "../core/defineFactory";
import { faker, unique } from "../core/faker";
import { pinUserId } from "../core/pinUserId";

type UpsertArgs = Parameters<typeof UserRepository.upsert>[0];

type Role = "ARTIST" | "VIDEO_ADDER" | "TOURNAMENT_ORGANIZER" | "API_ACCESSER";

type Options = {
	plusTier?: Tables["PlusTier"]["tier"];
	/** Patron who started supporting now and has a year left of it. */
	patronTier?: NonNullable<Tables["User"]["patronTier"]>;
	roles?: Array<Role>;
};

const PATRONAGE_LENGTH = { years: 1 };

const GRANT_ROLE: Record<Role, (userId: number) => Promise<unknown>> = {
	ARTIST: AdminRepository.makeArtistByUserId,
	VIDEO_ADDER: AdminRepository.makeVideoAdderByUserId,
	TOURNAMENT_ORGANIZER: AdminRepository.makeTournamentOrganizerByUserId,
	API_ACCESSER: AdminRepository.makeApiAccesserByUserId,
};

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
	applyOptions: (user, options: Options) => grantPrivileges(user.id, options),
});

/**
 * Creates the admin user, on the id the app's permission logic treats as an admin.
 * Also who `wrappedAction({ user: "admin" })` submits as.
 *
 * Has to be created before any other user, see {@link pinUserId}.
 */
export async function createAdmin(
	overrides?: Partial<UpsertArgs> | null,
	options?: Options,
) {
	const user = await create(overrides);
	const id = await pinUserId(user.id, ADMIN_ID);

	// after pinning, so that rows keyed by the user id don't point at the old one
	if (options) {
		await grantPrivileges(id, options);
	}

	return { id };
}

/**
 * Creates the user that `wrappedAction({ user: "regular" })` submits as. Has no
 * permissions of any kind unless `options` gives it some; use for the "somebody
 * else" side of a permission test.
 *
 * Has to be created before any user without a pinned id, see {@link pinUserId}.
 */
export async function createRegular(
	overrides?: Partial<UpsertArgs> | null,
	options?: Options,
) {
	const user = await create(overrides);
	const id = await pinUserId(user.id, REGULAR_USER_TEST_ID);

	// after pinning, so that rows keyed by the user id don't point at the old one
	if (options) {
		await grantPrivileges(id, options);
	}

	return { id };
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

async function grantPrivileges(
	userId: number,
	{ plusTier, patronTier, roles }: Options,
) {
	if (typeof plusTier === "number") {
		await setPlusTier(userId, plusTier);
	}

	if (typeof patronTier === "number") {
		await AdminRepository.forcePatron({
			id: userId,
			patronTier,
			patronStartedAt: new Date(),
			patronExpiresAt: add(new Date(), PATRONAGE_LENGTH),
		});
	}

	for (const role of roles ?? []) {
		await GRANT_ROLE[role](userId);
	}
}

async function setPlusTier(userId: number, plusTier: number) {
	// `replacePlusTiers` replaces every row, being the monthly recount of who is in
	// what tier, so the tiers granted before this one are read back and sent along
	const others = await db
		.selectFrom("PlusTier")
		.select(["userId", "tier"])
		.where("userId", "!=", userId)
		.execute();

	await AdminRepository.replacePlusTiers([
		...others.map((other) => ({ userId: other.userId, plusTier: other.tier })),
		{ userId, plusTier },
	]);

	// xxx: should be in replacePlusTiers etc.?
	await BuildRepository.recalculateAllSortValues(userId);
}

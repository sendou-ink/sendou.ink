import { add } from "date-fns";
import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import * as AdminRepository from "~/features/admin/AdminRepository.server";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import * as MatchProfileRepository from "~/features/match-profile/MatchProfileRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import invariant from "~/utils/invariant";
import { REGULAR_USER_TEST_ID } from "../constants";
import { actAs } from "../core/actAs";
import { defineFactory } from "../core/defineFactory";
import { faker, unique } from "../core/faker";
import { pinUserId } from "../core/pinUserId";

type UpsertArgs = Parameters<typeof UserRepository.upsert>[0];

type MatchProfileArgs = Parameters<
	typeof MatchProfileRepository.updateOwnMatchProfile
>[0];

type Role = "ARTIST" | "VIDEO_ADDER" | "TOURNAMENT_ORGANIZER" | "API_ACCESSER";

type Options = {
	plusTier?: Tables["PlusTier"]["tier"];
	/** Patron who started supporting now and has a year left of it. */
	patronTier?: NonNullable<Tables["User"]["patronTier"]>;
	roles?: Array<Role>;
	/** SendouQ match profile, submitted as the user themselves. */
	matchProfile?: Partial<MatchProfileArgs>;
	/** Ban as an admin lays one down: `1` for good, or the date it lifts on. */
	ban?: Omit<Parameters<typeof AdminRepository.banUser>[0], "userId">;
	/** Division the user played their last season in. */
	div?: NonNullable<Tables["User"]["div"]>;
	/** Weapon pool, submitted as the user themselves. */
	weapons?: Parameters<typeof UserRepository.updateOwnProfile>[0]["weapons"];
};

const PATRONAGE_LENGTH = { years: 1 };

const EMPTY_MATCH_PROFILE: MatchProfileArgs = {
	mapModePreferences: { modes: [], pool: [] },
	vc: "NO",
	languages: [],
	weaponPool: [],
	noScreen: 0,
};

const GRANT_ROLE: Record<Role, (userId: number) => Promise<unknown>> = {
	ARTIST: AdminRepository.makeArtistByUserId,
	VIDEO_ADDER: AdminRepository.makeVideoAdderByUserId,
	TOURNAMENT_ORGANIZER: AdminRepository.makeTournamentOrganizerByUserId,
	API_ACCESSER: AdminRepository.makeApiAccesserByUserId,
};

/** Creates users. Columns outside `UserRepository.upsert` (patron status, plus tier,
 * match profile) are set by the repository function that owns them. */
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
	applyOptions: (user, options: Options) => grant(user.id, options),
});

/**
 * Creates the admin user, on the id the app's permission logic treats as an admin.
 * Also who `wrappedAction({ user: "admin" })` submits as.
 *
 * Has to be created before any other user, see {@link pinUserId}.
 */
export const createAdmin = (
	overrides?: Partial<UpsertArgs> | null,
	options?: Options,
) => createPinned(ADMIN_ID, overrides, options);

/**
 * Creates the user that `wrappedAction({ user: "regular" })` submits as. Has no
 * permissions of any kind unless `options` gives it some; use for the "somebody
 * else" side of a permission test.
 *
 * Has to be created before any user without a pinned id, see {@link pinUserId}.
 */
export const createRegular = (
	overrides?: Partial<UpsertArgs> | null,
	options?: Options,
) => createPinned(REGULAR_USER_TEST_ID, overrides, options);

async function createPinned(
	pinnedId: number,
	overrides?: Partial<UpsertArgs> | null,
	options?: Options,
) {
	const user = await create(overrides);
	const id = await pinUserId(user.id, pinnedId);

	// after pinning, so that rows keyed by the user id don't point at the old one
	if (options) {
		await grant(id, options);
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

/**
 * What `create`'s second argument does, applied to a user that already exists — for
 * the tests whose users come from shared setup, or that want two of them given
 * different things.
 */
export async function grant(
	userId: number,
	{ plusTier, patronTier, roles, matchProfile, ban, div, weapons }: Options,
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

	if (matchProfile) {
		await actAs(userId, () =>
			MatchProfileRepository.updateOwnMatchProfile({
				...EMPTY_MATCH_PROFILE,
				...matchProfile,
			}),
		);
	}

	if (ban) {
		await AdminRepository.banUser({ userId, ...ban });
	}

	if (div) {
		await UserRepository.updateManyDivs([{ userId, div }]);
	}

	if (weapons) {
		// the profile page saves every field at once; everything besides the weapons
		// is still empty on a user the repository has only just upserted
		await actAs(userId, () => UserRepository.updateOwnProfile({ weapons }));
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

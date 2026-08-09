import { add } from "date-fns";
import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import type { CustomTheme, Pronouns, UserPreferences } from "~/db/tables-json";
import * as AdminRepository from "~/features/admin/AdminRepository.server";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import * as MatchProfileRepository from "~/features/match-profile/MatchProfileRepository.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import invariant from "~/utils/invariant";
import { toDBBoolean } from "~/utils/sql";
import {
	ORG_ADMIN_TEST_ID,
	REGULAR_USER_TEST_ID,
	STAFF_TEST_ID,
} from "../constants";
import { actAs } from "../core/actAs";
import { defineFactory } from "../core/defineFactory";
import { faker, unique } from "../core/faker";
import { pinUserId } from "../core/pinUserId";
import * as SplatoonFaker from "../core/SplatoonFaker";

type UpsertArgs = Parameters<typeof UserRepository.upsert>[0] & {
	/** Profile fields, saved as the profile page saves them. `null` for a bare profile. */
	profile?: Partial<ProfileArgs> | null;
	/** Nintendo friend code, `null` for a user who never submitted one. */
	friendCode?: string | null;
};

type ProfileArgs = Parameters<typeof UserRepository.updateOwnProfile>[0];

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
	/** User card fields, submitted as the user themselves. */
	card?: Partial<CardArgs>;
	/** Profile page widgets, replacing whatever the user had. Only shown to a user
	 * who is a supporter and has `newProfileEnabled` in their `preferences`. */
	widgets?: Parameters<typeof UserRepository.upsertWidgets>[1];
	/** Preferences, merged into the ones the user has, as the settings pages save them. */
	preferences?: UserPreferences;
	/** Custom theme, saved as the settings page saves it. Only shown to a supporter. */
	customTheme?: CustomTheme;
};

type CardArgs = Parameters<typeof UserCardRepository.updateOwnCard>[0];

const EMPTY_CARD: CardArgs = {
	shortBio: null,
	bannerPresetImg: null,
	bannerImgId: null,
	unverifiedPeakXP: null,
	xpDivision: null,
	hiddenCardStats: [],
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
		discordId: fakeDiscordId(seq),
		discordName: unique(() => faker.internet.username()),
		discordUniqueName: null,
		discordAvatar: null,
		twitch: null,
		youtubeId: null,
		bsky: null,
		profile: fakeProfile(),
		friendCode: fakeFriendCode(),
	}),
	insert: async ({ profile, friendCode, ...args }: UpsertArgs) => {
		const user = await UserRepository.upsert(args);

		if (profile && Object.keys(profile).length > 0) {
			await updateProfile(user.id, profile);
		}

		if (friendCode) {
			await UserRepository.insertFriendCode({
				userId: user.id,
				submitterUserId: user.id,
				friendCode,
			});
		}

		return user;
	},
	applyOptions: (user, options: Options) => grant(user.id, options),
});

function fakeFriendCode() {
	return `${faker.string.numeric(4)}-${faker.string.numeric(4)}-${faker.string.numeric(4)}`;
}

/** A real-looking Discord snowflake: 42 bits of timestamp, `seq` in the low 22.
 * Must stay 10+ characters — `userByIdentifierQuery` resolves shorter numeric
 * identifiers as row ids, which would break `/u/<discordId>` links. */
function fakeDiscordId(seq: number) {
	const DISCORD_EPOCH_MS = 1420070400000n;
	const FAKE_CREATED_AT_MS = 1685577600000n; // 2023-06-01

	return String(((FAKE_CREATED_AT_MS - DISCORD_EPOCH_MS) << 22n) + BigInt(seq));
}

/** Saves profile fields as the user, for a user that already exists. The profile page
 * submits every field at once, prefilled with what the user has, so the fields the
 * caller leaves out keep their current value instead of being cleared. */
export async function updateProfile(
	userId: number,
	profile: Partial<ProfileArgs>,
) {
	const current = await currentProfile(userId);

	return actAs(userId, () =>
		UserRepository.updateOwnProfile({ ...current, ...profile }),
	);
}

async function currentProfile(userId: number): Promise<ProfileArgs> {
	const user = await db
		.selectFrom("User")
		.select([
			"country",
			"bio",
			"customUrl",
			"customName",
			"motionSens",
			"stickSens",
			"pronouns",
			"inGameName",
			"battlefy",
			"showDiscordUniqueName",
			"commissionText",
			"commissionsOpen",
			"favoriteBadgeIds",
			"favoriteTrophyIds",
			"hiddenTrophyIds",
			"customAvatarImgId",
		])
		.where("id", "=", userId)
		.executeTakeFirstOrThrow();

	const weapons = await db
		.selectFrom("UserWeapon")
		.select(["weaponSplId", "isFavorite"])
		.where("userId", "=", userId)
		.orderBy("order", "asc")
		.execute();

	return {
		...user,
		pronouns: user.pronouns ? JSON.stringify(user.pronouns) : null,
		weapons,
	};
}

/** Pronouns as the profile page saves them: the subject and object forms as one
 * JSON object, not the `he/him` string they are displayed as. */
export function fakePronouns() {
	return JSON.stringify(
		faker.helpers.arrayElement([
			{ subject: "he", object: "him" },
			{ subject: "she", object: "her" },
			{ subject: "they", object: "them" },
		] satisfies Pronouns[]),
	);
}

/** Country biased the way the player base is: US and the big European scenes
 * first, anything possible. */
export function fakeCountry() {
	return faker.helpers.weightedArrayElement([
		{ value: "US", weight: 30 },
		{ value: "FR", weight: 8 },
		{ value: "DE", weight: 8 },
		{ value: "GB", weight: 7 },
		{ value: "ES", weight: 5 },
		{ value: "IT", weight: 5 },
		{ value: "NL", weight: 4 },
		{ value: faker.location.countryCode(), weight: 33 },
	]);
}

function fakeProfile(): Partial<ProfileArgs> | null {
	if (faker.number.float(1) < 0.2) return null;

	const chance = (probability: number) => faker.number.float(1) < probability;

	return {
		country: fakeCountry(),
		bio: chance(0.4)
			? faker.lorem.paragraphs(faker.helpers.arrayElement([1, 1, 2, 3]), "\n\n")
			: undefined,
		inGameName: chance(0.5) ? SplatoonFaker.inGameName() : undefined,
		motionSens: chance(0.3)
			? faker.helpers.arrayElement([-50, -30, -10, 0, 10, 30, 50])
			: undefined,
		stickSens: chance(0.3)
			? faker.helpers.arrayElement([-50, -20, 0, 20, 50])
			: undefined,
		pronouns: chance(0.2) ? fakePronouns() : undefined,
		weapons: chance(0.6)
			? SplatoonFaker.mainWeapons(
					faker.helpers.arrayElement([1, 2, 3, 4, 5]),
				).map((weaponSplId) => ({
					weaponSplId,
					isFavorite: toDBBoolean(faker.number.float(1) < 0.2),
				}))
			: [],
	};
}

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

/** Creates the user on the id org permission checks treat as an org admin. */
export const createOrgAdmin = (
	overrides?: Partial<UpsertArgs> | null,
	options?: Options,
) => createPinned(ORG_ADMIN_TEST_ID, overrides, options);

/** Creates the user on the id the app's permission logic treats as staff. Create
 * after every unpinned user, so the ids in between stay free. */
export const createStaff = (
	overrides?: Partial<UpsertArgs> | null,
	options?: Options,
) => createPinned(STAFF_TEST_ID, overrides, options);

async function createPinned(
	pinnedId: number,
	overrides?: Partial<UpsertArgs> | null,
	options?: Options,
) {
	// rows keyed by the user id have to wait until after the pinning changes it
	const { profile, friendCode, ...upsertOverrides } = overrides ?? {};
	const user = await create({
		...upsertOverrides,
		profile: null,
		friendCode: null,
	});
	const id = await pinUserId(user.id, pinnedId);

	if (profile && Object.keys(profile).length > 0) {
		await updateProfile(id, profile);
	}

	if (friendCode) {
		await UserRepository.insertFriendCode({
			userId: id,
			submitterUserId: id,
			friendCode,
		});
	}

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
	{
		plusTier,
		patronTier,
		roles,
		matchProfile,
		ban,
		div,
		weapons,
		card,
		widgets,
		preferences,
		customTheme,
	}: Options,
) {
	if (card) {
		await actAs(userId, () =>
			UserCardRepository.updateOwnCard({ ...EMPTY_CARD, ...card }),
		);
	}

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

	if (widgets) {
		await UserRepository.upsertWidgets(userId, widgets);
	}

	if (preferences) {
		await actAs(userId, () => UserRepository.updateOwnPreferences(preferences));
	}

	if (customTheme) {
		await actAs(userId, () => UserRepository.updateOwnCustomTheme(customTheme));
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
}

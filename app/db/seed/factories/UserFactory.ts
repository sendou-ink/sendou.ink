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
	/** User card fields, submitted as the user themselves. */
	card?: Partial<CardArgs>;
	/** Replaces the user's widgets, i.e. their profile layout, in place of the default one. */
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

/** Columns outside `UserRepository.upsert` (patron status, plus tier, match profile) are set by their owning repository function. */
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

/** Snowflake-like: 42 bits of timestamp, `seq` in the low 22. Must stay 10+ chars or `userByIdentifierQuery` reads it as a row id. */
function fakeDiscordId(seq: number) {
	const DISCORD_EPOCH_MS = 1420070400000n;
	const FAKE_CREATED_AT_MS = 1685577600000n; // 2023-06-01

	return String(((FAKE_CREATED_AT_MS - DISCORD_EPOCH_MS) << 22n) + BigInt(seq));
}

/** Saves profile fields as the user; like the profile page, fields left out keep their current value. */
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
			"customUrl",
			"customName",
			"pronouns",
			"inGameName",
			"commissionText",
			"commissionsOpen",
			"favoriteBadgeIds",
			"favoriteTrophyIds",
			"hiddenTrophyIds",
			"customAvatarImgId",
		])
		.where("id", "=", userId)
		.executeTakeFirstOrThrow();

	return {
		...user,
		pronouns: user.pronouns ? JSON.stringify(user.pronouns) : null,
	};
}

/** Links the Twitch account the way logging in with it connected on Discord does. */
export async function linkTwitch(userId: number, twitch: string | null) {
	const user = await db
		.selectFrom("User")
		.select([
			"discordId",
			"discordName",
			"discordAvatar",
			"discordUniqueName",
			"youtubeId",
			"bsky",
		])
		.where("id", "=", userId)
		.executeTakeFirstOrThrow();

	await UserRepository.upsert({ ...user, twitch });
}

/** Subject and object forms as one JSON object, as the profile page saves them. */
export function fakePronouns() {
	return JSON.stringify(
		faker.helpers.arrayElement([
			{ subject: "he", object: "him" },
			{ subject: "she", object: "her" },
			{ subject: "they", object: "them" },
		] satisfies Pronouns[]),
	);
}

/** Biased like the player base: US and big European scenes first, anything possible. */
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
		inGameName: chance(0.5) ? SplatoonFaker.inGameName() : undefined,
		pronouns: chance(0.2) ? fakePronouns() : undefined,
	};
}

/** The admin id user, who `wrappedAction({ user: "admin" })` submits as. Create before any other user, see {@link pinUserId}. */
export const createAdmin = (
	overrides?: Partial<UpsertArgs> | null,
	options?: Options,
) => createPinned(ADMIN_ID, overrides, options);

/**
 * Who `wrappedAction({ user: "regular" })` submits as; no permissions unless `options` gives some.
 * Create before any user without a pinned id, see {@link pinUserId}.
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

/** The staff id user. Create after every unpinned user so the ids in between stay free. */
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
 * Interchangeable users referred to by creation order, for tests needing more users than it makes
 * sense to name. Declare at module scope, fill in `beforeEach` with `users.create(20)`, read with `users.id(1)`.
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

/** `create`'s second argument applied to an existing user. */
export async function grant(
	userId: number,
	{
		plusTier,
		patronTier,
		roles,
		matchProfile,
		ban,
		div,
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
	// `replacePlusTiers` replaces every row (monthly recount), so earlier grants are read back and sent along
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

import type { UserMapModePreferences } from "~/db/tables-json";
import { ADMIN_DISCORD_ID } from "~/features/admin/admin-constants";
import { BANNED_MAPS } from "~/features/match-profile/banned-maps";
import { AMOUNT_OF_MAPS_IN_POOL_PER_MODE } from "~/features/match-profile/match-profile-constants";
import { LUTI_DIVS } from "~/features/scrims/scrims-constants";
import { PRESET_COLORS } from "~/features/tier-list-maker/tier-list-maker-constants";
import type { UnifiedLanguageCode } from "~/modules/i18n/config";
import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import {
	ADMIN_TEST_AVATAR,
	NZAP_TEST_AVATAR,
	NZAP_TEST_DISCORD_ID,
	STAFF_TEST_DISCORD_ID,
} from "../constants";
import { faker } from "../core/faker";
import * as SplatoonFaker from "../core/SplatoonFaker";
import * as showcaseNames from "../core/showcaseNames";
import * as UserFactory from "../factories/UserFactory";

const SHOWCASE_COUNT = 100;
const CROWD_COUNT = 396;

export type SeededUsers = {
	adminId: number;
	nzapId: number;
	orgAdminId: number;
	staffId: number;
	/** The curated first ~100, wired into everything later modules seed. */
	showcaseIds: number[];
	crowdIds: number[];
	/** Showcase users with the artist role, some with commissions open. */
	artistIds: number[];
	/** Showcase users whose profile can gain favorite badges without losing anything. */
	favoriteBadgeUserIds: number[];
};

export async function seedUsers(): Promise<SeededUsers> {
	// the plainest of the two profiles: no supporter perks, so the old profile page
	const admin = await UserFactory.createAdmin(
		{
			discordId: ADMIN_DISCORD_ID,
			discordName: "Sendou",
			discordUniqueName: "sendou",
			discordAvatar: ADMIN_TEST_AVATAR,
			twitch: "Sendou",
			profile: {
				country: "FI",
				customUrl: "sendou",
				inGameName: "Sendou#1234",
				bio: showcaseNames.postText(),
				weapons: [{ weaponSplId: 200, isFavorite: 0 }],
			},
			friendCode: "0109-8080-3707",
		},
		{
			roles: ["VIDEO_ADDER", "TOURNAMENT_ORGANIZER", "ARTIST"],
			matchProfile: { mapModePreferences: fakePreferences(), vc: "YES" },
		},
	);

	const nzap = await UserFactory.createRegular(
		{
			discordId: NZAP_TEST_DISCORD_ID,
			discordName: "N-ZAP",
			discordUniqueName: "nzap",
			discordAvatar: NZAP_TEST_AVATAR,
			twitch: "nzap_stream",
			youtubeId: "UCWbJLXByvsfQvTcR4HLPs5Q",
			bsky: "nzap.bsky.social",
			profile: {
				country: "SE",
				customUrl: "nzap",
				motionSens: 50,
				stickSens: 5,
				pronouns: JSON.stringify({ subject: "they", object: "them" }),
				inGameName: "N-ZAP#5678",
				bio: showcaseNames.maxLengthBio(),
				weapons: ([200, 1100, 2000, 4000] as const).map((weaponSplId) => ({
					weaponSplId,
					isFavorite: 0 as const,
				})),
			},
			friendCode: "1234-5678-9012",
		},
		{
			patronTier: 2,
			roles: ["VIDEO_ADDER", "TOURNAMENT_ORGANIZER", "ARTIST"],
			matchProfile: {
				mapModePreferences: fakePreferences(),
				vc: "YES",
				languages: ["en", "ja"],
				weaponPool: SplatoonFaker.mainWeapons(4).map((id) => ({
					id,
					isFavorite: false,
				})),
			},
			card: { shortBio: "Supporter of sendou.ink" },
			preferences: { newProfileEnabled: true },
			widgets: nzapWidgets(),
		},
	);

	const orgAdmin = await UserFactory.createOrgAdmin(null, {
		roles: ["API_ACCESSER"],
	});

	const showcase = await seedShowcaseUsers();
	const crowd = await UserFactory.createMany(CROWD_COUNT);
	for (const [i, user] of crowd.entries()) {
		if (i % 2 === 0) continue;

		await UserFactory.grant(user.id, {
			matchProfile: {
				weaponPool: SplatoonFaker.mainWeapons(
					faker.helpers.arrayElement([1, 2, 3, 4]),
				).map((id) => ({ id, isFavorite: faker.number.float(1) < 0.3 })),
			},
		});
	}

	const staff = await UserFactory.createStaff({
		discordId: STAFF_TEST_DISCORD_ID,
		discordName: "Panda",
	});

	return {
		adminId: admin.id,
		nzapId: nzap.id,
		orgAdminId: orgAdmin.id,
		staffId: staff.id,
		showcaseIds: showcase.ids,
		crowdIds: crowd.map((user) => user.id),
		artistIds: showcase.artistIds,
		favoriteBadgeUserIds: showcase.favoriteBadgeUserIds,
	};
}

async function seedShowcaseUsers() {
	const ids: number[] = [];
	const artistIds: number[] = [];
	const favoriteBadgeUserIds: number[] = [];

	for (const [i, customName] of showcaseNames.CUSTOM_NAMES.entries()) {
		const hasKanji = /[一-龯]/u.test(customName);

		const user = await UserFactory.create(
			{
				profile: {
					customName,
					inGameName: hasKanji
						? showcaseNames.kanaInGameName()
						: SplatoonFaker.inGameName(),
					bio: i === 0 ? showcaseNames.maxLengthBio() : undefined,
					weapons: [],
				},
			},
			showcaseOptions(),
		);

		ids.push(user.id);
		favoriteBadgeUserIds.push(user.id);
	}

	const noProfileUser = await UserFactory.create({
		profile: null,
		friendCode: null,
	});
	ids.push(noProfileUser.id);

	const maximalUser = await UserFactory.create(
		{
			profile: {
				customName: showcaseNames.customName(),
				customUrl: "maximal",
				country: "JP",
				bio: showcaseNames.maxLengthBio(),
				pronouns: JSON.stringify({ subject: "they", object: "them" }),
				motionSens: -25,
				stickSens: 10,
				inGameName: showcaseNames.kanaInGameName(),
				weapons: SplatoonFaker.mainWeapons(5).map((weaponSplId) => ({
					weaponSplId,
					isFavorite: 1,
				})),
			},
		},
		{
			...showcaseOptions(),
			patronTier: 2,
			card: {
				shortBio: faker.lorem.sentence(),
				bannerPresetImg: String(faker.helpers.arrayElement(stageIds)),
				unverifiedPeakXP: fakePeakXp(),
			},
		},
	);
	ids.push(maximalUser.id);

	for (let i = ids.length; i < SHOWCASE_COUNT; i++) {
		const isArtist = artistIds.length < 12;
		const commissionsOpen = isArtist && faker.number.float(1) < 0.5;

		const user = await UserFactory.create(
			{
				profile: {
					customName:
						faker.number.float(1) < 0.6
							? showcaseNames.customName()
							: undefined,
					customUrl: faker.number.float(1) < 0.2 ? `showcase-${i}` : undefined,
					country:
						faker.number.float(1) < 0.8 ? UserFactory.fakeCountry() : undefined,
					bio:
						faker.number.float(1) < 0.5 ? showcaseNames.postText() : undefined,
					inGameName:
						faker.number.float(1) < 0.4
							? showcaseNames.kanaInGameName()
							: SplatoonFaker.inGameName(),
					commissionsOpen: commissionsOpen ? 1 : undefined,
					commissionText: commissionsOpen ? faker.lorem.paragraph() : undefined,
					weapons: SplatoonFaker.mainWeapons(
						faker.helpers.arrayElement([1, 2, 3, 4]),
					).map((weaponSplId) => ({
						weaponSplId,
						isFavorite: faker.number.float(1) < 0.2 ? 1 : 0,
					})),
				},
			},
			{
				...showcaseOptions(),
				roles: isArtist ? ["ARTIST"] : undefined,
			},
		);

		ids.push(user.id);
		if (isArtist) {
			artistIds.push(user.id);
		}
	}

	return { ids, artistIds, favoriteBadgeUserIds };
}

/** The one seeded supporter's widgets: both slots filled, every widget other modules seed content for. */
function nzapWidgets(): NonNullable<
	Parameters<typeof UserFactory.create>[1]
>["widgets"] {
	return [
		{ id: "bio-md", settings: { bio: showcaseNames.maxLengthBio() } },
		{ id: "teams" },
		{ id: "organizations" },
		{ id: "patron-since" },
		{
			id: "sens",
			settings: { controller: "s2-pro-con", motionSens: 50, stickSens: 5 },
		},
		{ id: "timezone", settings: { timezone: "Europe/Stockholm" } },
		{ id: "social-links" },
		{ id: "weapon-pool" },
		{ id: "badges-owned" },
		{ id: "trophies-owned" },
		{ id: "builds" },
		{ id: "videos" },
		{ id: "art", settings: { source: "ALL" } },
		{ id: "x-rank-peaks", settings: { division: "both" } },
		{ id: "peak-sp" },
		{ id: "peak-xp" },
		{ id: "friends" },
		{ id: "highlighted-results" },
	];
}

function showcaseOptions(): Parameters<typeof UserFactory.create>[1] {
	return {
		matchProfile: {
			mapModePreferences: fakePreferences(),
			vc: faker.helpers.arrayElement([
				"YES",
				"YES",
				"YES",
				"NO",
				"LISTEN_ONLY",
			]),
			languages: fakeLanguages(),
			weaponPool: SplatoonFaker.mainWeapons(
				faker.helpers.arrayElement([1, 2, 3, 4]),
			).map((id) => ({ id, isFavorite: faker.number.float(1) < 0.3 })),
		},
		div:
			faker.number.float(1) < 0.6
				? faker.helpers.arrayElement(LUTI_DIVS)
				: undefined,
		card: {
			shortBio: faker.number.float(1) < 0.6 ? faker.lorem.sentence() : null,
			bannerPresetImg: fakeBannerPresetImg(),
			unverifiedPeakXP: faker.number.float(1) < 0.4 ? fakePeakXp() : null,
		},
	};
}

function fakeLanguages(): UnifiedLanguageCode[] {
	const languages: UnifiedLanguageCode[] =
		faker.number.float(1) > 0.1 ? ["en"] : [];
	for (const language of ["es", "fr", "de", "it", "ja"] as const) {
		if (faker.number.float(1) > 0.9) languages.push(language);
	}

	return languages;
}

function fakePreferences(): UserMapModePreferences {
	const modes: UserMapModePreferences["modes"] = modesShort.flatMap((mode) => {
		if (faker.number.float(1) > 0.5 && mode !== "SZ") return [];

		return {
			mode,
			preference:
				faker.number.float(1) > (mode === "SZ" ? 0.2 : 0.5)
					? ("PREFER" as const)
					: ("AVOID" as const),
		};
	});

	return {
		modes,
		pool: modesShort.flatMap((mode) => {
			const preference = modes.find((m) => m.mode === mode);
			if (preference?.preference === "AVOID") return [];

			return {
				mode,
				stages: faker.helpers
					.shuffle(stageIds)
					.filter((stageId) => !BANNED_MAPS[mode].includes(stageId))
					.slice(0, AMOUNT_OF_MAPS_IN_POOL_PER_MODE),
			};
		}),
	};
}

/** Self-reported peak XP with exactly one division defined, as the column expects. */
function fakePeakXp() {
	const points = faker.number.int({ min: 2000, max: 3500 });
	const isTentatek = faker.datatype.boolean();

	return {
		overall: points,
		tentatek: isTentatek ? points : null,
		takoroka: isTentatek ? null : points,
	};
}

/** Mix of the three banner sources: null, a stage banner, an explicit color. */
function fakeBannerPresetImg() {
	const roll = faker.number.float(1);
	if (roll < 0.34) return null;
	if (roll < 0.67) return String(faker.helpers.arrayElement(stageIds));

	return faker.helpers.arrayElement(PRESET_COLORS);
}

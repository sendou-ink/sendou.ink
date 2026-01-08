import { describe, expect, test } from "vitest";
import type { LFGType } from "~/db/tables";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import type { LFGFiltersState } from "../lfg-types";
import type { LFGLoaderPost, TiersMap } from "../routes/lfg";
import { filterPosts } from "./filtering";

const createPost = (
	overrides: Partial<{
		type: LFGType;
		timezone: string;
		languages: string | null;
		authorId: number;
		authorWeapons: MainWeaponId[];
		authorPlusTier: number | null;
		teamMembers: Array<{
			id: number;
			weaponPool: MainWeaponId[];
			plusTier: number | null;
		}>;
	}> = {},
): LFGLoaderPost => {
	return {
		id: 1,
		type: overrides.type ?? "PLAYER_FOR_TEAM",
		timezone: overrides.timezone ?? "America/New_York",
		text: "Looking for team",
		createdAt: 1704067200,
		updatedAt: 1704067200,
		plusTierVisibility: null,
		languages: overrides.languages ?? null,
		author: {
			id: overrides.authorId ?? 1,
			discordId: "123456789",
			username: "Player",
			discordAvatar: null,
			customUrl: "player",
			plusTier: overrides.authorPlusTier ?? null,
			weaponPool: (overrides.authorWeapons ?? []).map((weaponSplId) => ({
				weaponSplId,
				isFavorite: 0,
			})),
			languages: null,
			country: null,
		},
		team: overrides.teamMembers
			? {
					id: 1,
					name: "Test Team",
					avatarUrl: null,
					members: overrides.teamMembers.map((m, i) => ({
						id: m.id,
						discordId: `member${i}`,
						username: `Member ${i}`,
						discordAvatar: null,
						customUrl: `member${i}`,
						plusTier: m.plusTier,
						weaponPool: m.weaponPool.map((weaponSplId) => ({
							weaponSplId,
							isFavorite: 0,
						})),
						languages: null,
						country: null,
					})),
				}
			: null,
	};
};

const defaultFilters: LFGFiltersState = {
	weapon: [],
	type: null,
	timezone: null,
	language: null,
	plusTier: null,
	minTier: null,
	maxTier: null,
};

const emptyTiersMap: TiersMap = new Map();

describe("filterPosts()", () => {
	test("returns all posts when no filters applied", () => {
		const posts = [createPost(), createPost({ authorId: 2 })];
		const result = filterPosts(posts, defaultFilters, emptyTiersMap);
		expect(result).toHaveLength(2);
	});

	test("filters by post type", () => {
		const posts = [
			createPost({ type: "PLAYER_FOR_TEAM" }),
			createPost({ type: "TEAM_FOR_PLAYER", authorId: 2 }),
		];
		const result = filterPosts(
			posts,
			{ ...defaultFilters, type: "PLAYER_FOR_TEAM" },
			emptyTiersMap,
		);
		expect(result).toHaveLength(1);
		expect(result[0].type).toBe("PLAYER_FOR_TEAM");
	});

	test("filters by weapon", () => {
		const posts = [
			createPost({ authorWeapons: [10 as MainWeaponId] }),
			createPost({
				authorId: 2,
				authorWeapons: [20 as MainWeaponId],
			}),
		];
		const result = filterPosts(
			posts,
			{ ...defaultFilters, weapon: [10 as MainWeaponId] },
			emptyTiersMap,
		);
		expect(result).toHaveLength(1);
	});

	test("weapon filter matches team members", () => {
		const posts = [
			createPost({
				authorWeapons: [],
				teamMembers: [
					{ id: 10, weaponPool: [10 as MainWeaponId], plusTier: null },
				],
			}),
		];
		const result = filterPosts(
			posts,
			{ ...defaultFilters, weapon: [10 as MainWeaponId] },
			emptyTiersMap,
		);
		expect(result).toHaveLength(1);
	});

	test("weapon filter skips COACH_FOR_TEAM posts", () => {
		const posts = [createPost({ type: "COACH_FOR_TEAM", authorWeapons: [] })];
		const result = filterPosts(
			posts,
			{ ...defaultFilters, weapon: [10 as MainWeaponId] },
			emptyTiersMap,
		);
		expect(result).toHaveLength(1);
	});

	test("filters by language", () => {
		const posts = [
			createPost({ languages: "en,ja" }),
			createPost({ authorId: 2, languages: "de" }),
			createPost({ authorId: 3, languages: null }),
		];
		const result = filterPosts(
			posts,
			{ ...defaultFilters, language: "en" },
			emptyTiersMap,
		);
		expect(result).toHaveLength(1);
	});

	test("filters by plusTier", () => {
		const posts = [
			createPost({ authorPlusTier: 1 }),
			createPost({ authorId: 2, authorPlusTier: 2 }),
			createPost({ authorId: 3, authorPlusTier: 3 }),
			createPost({ authorId: 4, authorPlusTier: null }),
		];
		const result = filterPosts(
			posts,
			{ ...defaultFilters, plusTier: 2 },
			emptyTiersMap,
		);
		expect(result).toHaveLength(2);
	});

	test("plusTier filter matches team members", () => {
		const posts = [
			createPost({
				authorPlusTier: null,
				teamMembers: [{ id: 10, weaponPool: [], plusTier: 1 }],
			}),
		];
		const result = filterPosts(
			posts,
			{ ...defaultFilters, plusTier: 2 },
			emptyTiersMap,
		);
		expect(result).toHaveLength(1);
	});

	test("filters by minTier", () => {
		const tiersMap: TiersMap = new Map([
			[1, { latest: { name: "GOLD", isPlus: false } }],
			[2, { latest: { name: "IRON", isPlus: false } }],
		]);
		const posts = [createPost({ authorId: 1 }), createPost({ authorId: 2 })];
		const result = filterPosts(
			posts,
			{ ...defaultFilters, minTier: "SILVER" },
			tiersMap,
		);
		expect(result).toHaveLength(1);
	});

	test("filters by maxTier", () => {
		const tiersMap: TiersMap = new Map([
			[1, { latest: { name: "LEVIATHAN", isPlus: false } }],
			[2, { latest: { name: "SILVER", isPlus: false } }],
		]);
		const posts = [createPost({ authorId: 1 }), createPost({ authorId: 2 })];
		const result = filterPosts(
			posts,
			{ ...defaultFilters, maxTier: "GOLD" },
			tiersMap,
		);
		expect(result).toHaveLength(1);
	});

	test("tier filter uses previous season if latest not available", () => {
		const tiersMap: TiersMap = new Map([
			[1, { previous: { name: "DIAMOND", isPlus: false } }],
		]);
		const posts = [createPost({ authorId: 1 })];
		const result = filterPosts(
			posts,
			{ ...defaultFilters, minTier: "PLATINUM" },
			tiersMap,
		);
		expect(result).toHaveLength(1);
	});

	test("tier filter skips COACH_FOR_TEAM posts", () => {
		const posts = [createPost({ type: "COACH_FOR_TEAM", authorId: 1 })];
		const result = filterPosts(
			posts,
			{ ...defaultFilters, minTier: "DIAMOND" },
			emptyTiersMap,
		);
		expect(result).toHaveLength(1);
	});

	test("combines multiple filters", () => {
		const posts = [
			createPost({
				type: "PLAYER_FOR_TEAM",
				languages: "en",
				authorWeapons: [10 as MainWeaponId],
			}),
			createPost({
				authorId: 2,
				type: "TEAM_FOR_PLAYER",
				languages: "en",
				authorWeapons: [10 as MainWeaponId],
			}),
			createPost({
				authorId: 3,
				type: "PLAYER_FOR_TEAM",
				languages: "de",
				authorWeapons: [10 as MainWeaponId],
			}),
		];
		const result = filterPosts(
			posts,
			{
				...defaultFilters,
				type: "PLAYER_FOR_TEAM",
				language: "en",
				weapon: [10 as MainWeaponId],
			},
			emptyTiersMap,
		);
		expect(result).toHaveLength(1);
	});
});

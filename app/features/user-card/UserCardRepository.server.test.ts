import { beforeEach, describe, expect, test } from "vitest";
import * as ImageFactory from "~/db/seed/factories/ImageFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as XRankPlacementFactory from "~/db/seed/factories/XRankPlacementFactory";
import { db } from "~/db/sql";
import * as PrivateUserNoteRepository from "~/features/sendouq/PrivateUserNoteRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { withNoUser, withUserId } from "~/utils/Test";
import * as UserCardRepository from "./UserCardRepository.server";
import type { UserCardData } from "./user-card-types";

const users = UserFactory.pool();

const insertVerifiedXp = (
	userId: number,
	power: number,
	region: "WEST" | "JPN" = "WEST",
) => XRankPlacementFactory.create({ playerUserId: userId, power, region });

const findXpStat = (card: UserCardData | undefined) =>
	card?.stats.find((stat) => stat.type === "XP");

describe("UserCardRepository.findAllByUserIds", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("returns an empty map when given no user ids", async () => {
		const { userCards } = await withNoUser(() =>
			UserCardRepository.findAllByUserIds({
				userIds: [],
			}),
		);

		expect(userCards.size).toBe(0);
	});

	test("keys cards by user id and builds the stats array from db fields", async () => {
		const plusMember = await UserFactory.create(null, {
			plusTier: 2,
			div: "1",
		});
		await insertVerifiedXp(plusMember.id, 2500);

		const { userCards } = await withNoUser(() =>
			UserCardRepository.findAllByUserIds({
				userIds: [plusMember.id, users.id(2)],
			}),
		);

		expect(userCards.size).toBe(2);

		const card = userCards.get(plusMember.id);
		expect(card?.id).toBe(plusMember.id);
		expect(card?.freeAgentPostId).toBeNull();

		const statTypes = card?.stats.map((stat) => stat.type) ?? [];
		expect(statTypes).toContain("XP");
		expect(statTypes).toContain("DIV");
		expect(statTypes).toContain("PLUS");

		expect(findXpStat(card)).toMatchObject({
			type: "XP",
			values: [{ isVerified: true, region: "WEST", points: 2500 }],
		});
		expect(card?.stats.find((stat) => stat.type === "DIV")).toMatchObject({
			type: "DIV",
			value: "1",
		});
		expect(card?.stats.find((stat) => stat.type === "PLUS")).toMatchObject({
			type: "PLUS",
			value: 2,
		});

		// user 2 has none of the optional fields -> no stats
		expect(userCards.get(users.id(2))?.stats).toHaveLength(0);
	});

	test("surfaces self-reported peak XP only when it beats the verified XP", async () => {
		await insertVerifiedXp(users.id(1), 2500);
		await withUserId(users.id(1), () =>
			UserCardRepository.updateOwnCard({
				shortBio: null,
				bannerPresetImg: null,
				bannerImgId: null,
				unverifiedPeakXP: { overall: 2600, takoroka: null, tentatek: 2600 },
				xpDivision: "WEST",
				hiddenCardStats: [],
			}),
		);

		const { userCards } = await withNoUser(() =>
			UserCardRepository.findAllByUserIds({ userIds: [users.id(1)] }),
		);

		expect(findXpStat(userCards.get(users.id(1)))).toMatchObject({
			type: "XP",
			values: [
				{ isVerified: false, region: "WEST", points: 2600 },
				{ isVerified: true, region: "WEST", points: 2500 },
			],
		});
	});

	test("ignores self-reported peak XP that does not beat the verified XP", async () => {
		await insertVerifiedXp(users.id(1), 2500);
		await withUserId(users.id(1), () =>
			UserCardRepository.updateOwnCard({
				shortBio: null,
				bannerPresetImg: null,
				bannerImgId: null,
				unverifiedPeakXP: { overall: 2400, takoroka: null, tentatek: 2400 },
				xpDivision: "WEST",
				hiddenCardStats: [],
			}),
		);

		const { userCards } = await withNoUser(() =>
			UserCardRepository.findAllByUserIds({ userIds: [users.id(1)] }),
		);

		expect(findXpStat(userCards.get(users.id(1)))).toMatchObject({
			type: "XP",
			values: [{ isVerified: true, region: "WEST", points: 2500 }],
		});
	});

	test("ignores self-reported peak XP more than 200 above the verified XP", async () => {
		await insertVerifiedXp(users.id(1), 2500);
		await withUserId(users.id(1), () =>
			UserCardRepository.updateOwnCard({
				shortBio: null,
				bannerPresetImg: null,
				bannerImgId: null,
				unverifiedPeakXP: { overall: 2800, takoroka: null, tentatek: 2800 },
				xpDivision: "WEST",
				hiddenCardStats: [],
			}),
		);

		const { userCards } = await withNoUser(() =>
			UserCardRepository.findAllByUserIds({ userIds: [users.id(1)] }),
		);

		expect(findXpStat(userCards.get(users.id(1)))).toMatchObject({
			type: "XP",
			values: [{ isVerified: true, region: "WEST", points: 2500 }],
		});
	});

	test("shows the verified peak XP of the picked division", async () => {
		await insertVerifiedXp(users.id(1), 3010, "WEST");
		await insertVerifiedXp(users.id(1), 3000, "JPN");
		await withUserId(users.id(1), () =>
			UserCardRepository.updateOwnCard({
				shortBio: null,
				bannerPresetImg: null,
				bannerImgId: null,
				unverifiedPeakXP: null,
				xpDivision: "JPN",
				hiddenCardStats: [],
			}),
		);

		const { userCards } = await withNoUser(() =>
			UserCardRepository.findAllByUserIds({ userIds: [users.id(1)] }),
		);

		expect(findXpStat(userCards.get(users.id(1)))).toMatchObject({
			type: "XP",
			values: [{ isVerified: true, region: "JPN", points: 3000 }],
		});
	});

	test("shows the highest verified peak XP across divisions when none is picked", async () => {
		await insertVerifiedXp(users.id(1), 3010, "WEST");
		await insertVerifiedXp(users.id(1), 3000, "JPN");

		const { userCards } = await withNoUser(() =>
			UserCardRepository.findAllByUserIds({ userIds: [users.id(1)] }),
		);

		expect(findXpStat(userCards.get(users.id(1)))).toMatchObject({
			type: "XP",
			values: [{ isVerified: true, region: "WEST", points: 3010 }],
		});
	});

	test("falls back to the other division when the picked one has no placements", async () => {
		await insertVerifiedXp(users.id(1), 3010, "WEST");
		await withUserId(users.id(1), () =>
			UserCardRepository.updateOwnCard({
				shortBio: null,
				bannerPresetImg: null,
				bannerImgId: null,
				unverifiedPeakXP: null,
				xpDivision: "JPN",
				hiddenCardStats: [],
			}),
		);

		const { userCards } = await withNoUser(() =>
			UserCardRepository.findAllByUserIds({ userIds: [users.id(1)] }),
		);

		expect(findXpStat(userCards.get(users.id(1)))).toMatchObject({
			type: "XP",
			values: [{ isVerified: true, region: "WEST", points: 3010 }],
		});
	});

	test("judges self-reported peak XP against the picked division's verified XP", async () => {
		await insertVerifiedXp(users.id(1), 3010, "WEST");
		await insertVerifiedXp(users.id(1), 3000, "JPN");
		await withUserId(users.id(1), () =>
			UserCardRepository.updateOwnCard({
				shortBio: null,
				bannerPresetImg: null,
				bannerImgId: null,
				unverifiedPeakXP: { overall: 3005, takoroka: 3005, tentatek: null },
				xpDivision: "JPN",
				hiddenCardStats: [],
			}),
		);

		const { userCards } = await withNoUser(() =>
			UserCardRepository.findAllByUserIds({ userIds: [users.id(1)] }),
		);

		// 3005 does not beat the 3010 of the other division, but that ladder is not the one shown
		expect(findXpStat(userCards.get(users.id(1)))).toMatchObject({
			type: "XP",
			values: [
				{ isVerified: false, region: "JPN", points: 3005 },
				{ isVerified: true, region: "JPN", points: 3000 },
			],
		});
	});

	test("surfaces self-reported peak XP equal to the other division's verified peak", async () => {
		await insertVerifiedXp(users.id(1), 3100, "WEST");
		await insertVerifiedXp(users.id(1), 3000, "JPN");
		await withUserId(users.id(1), () =>
			UserCardRepository.updateOwnCard({
				shortBio: null,
				bannerPresetImg: null,
				bannerImgId: null,
				unverifiedPeakXP: { overall: 3100, takoroka: 3100, tentatek: null },
				xpDivision: "JPN",
				hiddenCardStats: [],
			}),
		);

		const { userCards } = await withNoUser(() =>
			UserCardRepository.findAllByUserIds({ userIds: [users.id(1)] }),
		);

		expect(findXpStat(userCards.get(users.id(1)))).toMatchObject({
			type: "XP",
			values: [
				{ isVerified: false, region: "JPN", points: 3100 },
				{ isVerified: true, region: "JPN", points: 3000 },
			],
		});
	});

	test("keeps the self-reported peak XP in the picked division without placements there", async () => {
		await insertVerifiedXp(users.id(1), 2639.5, "WEST");
		await withUserId(users.id(1), () =>
			UserCardRepository.updateOwnCard({
				shortBio: null,
				bannerPresetImg: null,
				bannerImgId: null,
				unverifiedPeakXP: { overall: 2650, takoroka: 2650, tentatek: null },
				xpDivision: "JPN",
				hiddenCardStats: [],
			}),
		);

		const { userCards } = await withNoUser(() =>
			UserCardRepository.findAllByUserIds({ userIds: [users.id(1)] }),
		);

		expect(findXpStat(userCards.get(users.id(1)))).toMatchObject({
			type: "XP",
			values: [{ isVerified: false, region: "JPN", points: 2650 }],
		});
	});

	test("ignores self-reported peak XP when there is no verified XP", async () => {
		await withUserId(users.id(1), () =>
			UserCardRepository.updateOwnCard({
				shortBio: null,
				bannerPresetImg: null,
				bannerImgId: null,
				unverifiedPeakXP: { overall: 3000, takoroka: 3000, tentatek: null },
				xpDivision: "JPN",
				hiddenCardStats: [],
			}),
		);

		const { userCards } = await withNoUser(() =>
			UserCardRepository.findAllByUserIds({ userIds: [users.id(1)] }),
		);

		expect(findXpStat(userCards.get(users.id(1)))).toBeUndefined();
	});

	test("persists edited card fields and surfaces hidden stats", async () => {
		const plusMember = await UserFactory.create(null, { plusTier: 2 });
		await insertVerifiedXp(plusMember.id, 2500);

		await withUserId(plusMember.id, () =>
			UserCardRepository.updateOwnCard({
				shortBio: "hello",
				bannerPresetImg: "#ff4655",
				bannerImgId: null,
				unverifiedPeakXP: null,
				xpDivision: null,
				hiddenCardStats: ["XP"],
			}),
		);

		const { userCards } = await withUserId(plusMember.id, () =>
			UserCardRepository.findAllByUserIds({
				userIds: [plusMember.id],
			}),
		);
		const card = userCards.get(plusMember.id);

		expect(card?.shortBio).toBe("hello");
		expect(card?.banner).toMatchObject({ type: "COLOR", hexCode: "#ff4655" });
		// the hidden stat is filtered out of `stats` at query time
		expect(findXpStat(card)).toBeUndefined();
		expect(card?.stats.find((stat) => stat.type === "PLUS")).toMatchObject({
			type: "PLUS",
			value: 2,
		});

		const extras = await UserCardRepository.findCardEditExtrasByUserId(
			plusMember.id,
		);
		expect(extras.hiddenCardStats).toEqual(["XP"]);
	});

	test("keeps hidden stats in `stats` when includeHiddenStats is set", async () => {
		await insertVerifiedXp(users.id(1), 2500);

		await withUserId(users.id(1), () =>
			UserCardRepository.updateOwnCard({
				shortBio: null,
				bannerPresetImg: null,
				bannerImgId: null,
				unverifiedPeakXP: null,
				xpDivision: null,
				hiddenCardStats: ["XP"],
			}),
		);

		const { userCards } = await withUserId(users.id(1), () =>
			UserCardRepository.findAllByUserIds({
				userIds: [users.id(1)],
				includeHiddenStats: true,
			}),
		);
		const card = userCards.get(users.id(1));

		expect(findXpStat(card)).toMatchObject({
			type: "XP",
			values: [{ isVerified: true, region: "WEST", points: 2500 }],
		});
	});

	test("produces a URL banner when an uploaded banner image is set", async () => {
		const image = await ImageFactory.create(
			{ submitterUserId: users.id(1) },
			{ isValidated: true },
		);

		await withUserId(users.id(1), () =>
			UserCardRepository.updateOwnCard({
				shortBio: null,
				bannerPresetImg: null,
				bannerImgId: image.id,
				unverifiedPeakXP: null,
				xpDivision: null,
				hiddenCardStats: [],
			}),
		);

		const { userCards } = await withUserId(users.id(1), () =>
			UserCardRepository.findAllByUserIds({
				userIds: [users.id(1)],
			}),
		);

		const banner = userCards.get(users.id(1))?.banner;
		expect(banner?.type).toBe("URL");
		expect(banner).toHaveProperty("url");
	});
});

describe("UserCardRepository.findAllByUserIdsCached", () => {
	let target: { id: number };
	let viewer: { id: number };
	let otherViewer: { id: number };

	beforeEach(async () => {
		// user ids repeat between tests, so cards cached by an earlier test would be served here
		UserCardRepository.clearUserCardCache();
		[target, viewer, otherViewer] = await UserFactory.createMany(3);
	});

	const cachedCard = (userId: number, actorUserId?: number) => {
		const find = () =>
			UserCardRepository.findAllByUserIdsCached({ userIds: [userId] });

		return typeof actorUserId === "number"
			? withUserId(actorUserId, find)
			: withNoUser(find);
	};

	test("gives every viewer their own private note", async () => {
		await withUserId(viewer.id, () =>
			PrivateUserNoteRepository.upsertOwnNote({
				targetId: target.id,
				sentiment: "POSITIVE",
				text: "great teammate",
			}),
		);

		const forAuthor = await cachedCard(target.id, viewer.id);
		expect(forAuthor.userCards.get(target.id)?.privateNote).toMatchObject({
			sentiment: "POSITIVE",
			text: "great teammate",
		});

		// served from the entry the call above cached, which must not carry its note
		const forOther = await cachedCard(target.id, otherViewer.id);
		expect(forOther.userCards.get(target.id)?.privateNote).toBeNull();

		const forAnonymous = await cachedCard(target.id);
		expect(forAnonymous.userCards.get(target.id)?.privateNote).toBeNull();
	});

	test("serves cards from the cache and queries only the users missing from it", async () => {
		const first = await cachedCard(target.id);
		expect(first.userCards.get(target.id)?.shortBio).toBeNull();

		// written past the repository so the cached card is left in place
		await updateShortBioDirectly(target.id, "edited");

		const { userCards } = await withNoUser(() =>
			UserCardRepository.findAllByUserIdsCached({
				userIds: [target.id, viewer.id],
			}),
		);

		expect(userCards.get(target.id)?.shortBio).toBeNull();
		expect(userCards.get(viewer.id)?.id).toBe(viewer.id);
	});

	test("returns a fresh card once the cached one has expired", async () => {
		await cachedCard(target.id);

		await updateShortBioDirectly(target.id, "edited");
		UserCardRepository.clearUserCardCache();

		const { userCards } = await cachedCard(target.id);
		expect(userCards.get(target.id)?.shortBio).toBe("edited");
	});

	test("returns a fresh card right after its owner edited it", async () => {
		await cachedCard(target.id);

		await withUserId(target.id, () =>
			UserCardRepository.updateOwnCard({
				shortBio: "edited",
				bannerPresetImg: null,
				bannerImgId: null,
				unverifiedPeakXP: null,
				xpDivision: null,
				hiddenCardStats: [],
			}),
		);

		const { userCards } = await cachedCard(target.id);
		expect(userCards.get(target.id)?.shortBio).toBe("edited");
	});

	test("overlays the latest friend code only when opted in", async () => {
		const user = await UserFactory.create({ friendCode: null });
		for (const [friendCode, createdAt] of [
			["1111-2222-3333", new Date("2024-01-01")],
			["4444-5555-6666", new Date("2025-01-01")],
		] as const) {
			await UserRepository.insertFriendCode({
				userId: user.id,
				submitterUserId: user.id,
				friendCode,
				createdAt: dateToDatabaseTimestamp(createdAt),
			});
		}

		const withoutInclude = await cachedCard(user.id);
		expect(withoutInclude.userCards.get(user.id)?.friendCode).toBeNull();

		// served from the entry the call above cached, with the friend code overlaid on top
		const withInclude = await withNoUser(() =>
			UserCardRepository.findAllByUserIdsCached({
				userIds: [user.id],
				include: { friendCode: true },
			}),
		);
		expect(withInclude.userCards.get(user.id)?.friendCode).toBe(
			"4444-5555-6666",
		);

		// the include must not have stuck to the cached entry
		const withoutIncludeAgain = await cachedCard(user.id);
		expect(withoutIncludeAgain.userCards.get(user.id)?.friendCode).toBeNull();
	});

	test("coalesces concurrent misses for the same user into one query", async () => {
		const [first, second] = await Promise.all([
			cachedCard(target.id, viewer.id),
			cachedCard(target.id, otherViewer.id),
		]);

		// both viewers were served the same cached card, so only one query built it
		expect(first.userCards.get(target.id)?.stats).toBe(
			second.userCards.get(target.id)?.stats,
		);
	});
});

function updateShortBioDirectly(userId: number, shortBio: string) {
	// biome-ignore lint/plugin: updateOwnCard invalidates the cached card, which these tests need to leave in place
	return db
		.updateTable("User")
		.set({ shortBio })
		.where("id", "=", userId)
		.execute();
}

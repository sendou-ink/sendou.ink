import { beforeEach, describe, expect, it } from "vitest";
import * as ImageFactory from "~/db/seed/factories/ImageFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as XRankPlacementFactory from "~/db/seed/factories/XRankPlacementFactory";
import { db } from "~/db/sql";
import * as PrivateUserNoteRepository from "~/features/sendouq/PrivateUserNoteRepository.server";
import { withNoUser, withUserId } from "~/utils/Test";
import * as UserCardRepository from "./UserCardRepository.server";
import type { UserCardData } from "./user-card-types";

let owner: { id: number };
let other: { id: number };

const insertVerifiedXp = (
	userId: number,
	power: number,
	region: "WEST" | "JPN" = "WEST",
) => XRankPlacementFactory.create({ playerUserId: userId, power, region });

const findXpStat = (card: UserCardData | undefined) =>
	card?.stats.find((stat) => stat.type === "XP");

describe("UserCardRepository.findAllByUserIds", () => {
	beforeEach(async () => {
		[owner, other] = await UserFactory.createMany(2);
	});

	it("returns an empty map when given no user ids", async () => {
		const { userCards } = await withNoUser(() =>
			UserCardRepository.findAllByUserIds({
				userIds: [],
			}),
		);

		expect(userCards.size).toBe(0);
	});

	it("keys cards by user id and builds the stats array from db fields", async () => {
		const plusMember = await UserFactory.create(null, {
			plusTier: 2,
			div: "1",
		});
		await insertVerifiedXp(plusMember.id, 2500);

		const { userCards } = await withNoUser(() =>
			UserCardRepository.findAllByUserIds({
				userIds: [plusMember.id, other.id],
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
		expect(userCards.get(other.id)?.stats).toHaveLength(0);
	});

	it("surfaces self-reported peak XP only when it beats the verified XP", async () => {
		await insertVerifiedXp(owner.id, 2500);
		await withUserId(owner.id, () =>
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
			UserCardRepository.findAllByUserIds({ userIds: [owner.id] }),
		);

		expect(findXpStat(userCards.get(owner.id))).toMatchObject({
			type: "XP",
			values: [
				{ isVerified: false, region: "WEST", points: 2600 },
				{ isVerified: true, region: "WEST", points: 2500 },
			],
		});
	});

	it("ignores self-reported peak XP that does not beat the verified XP", async () => {
		await insertVerifiedXp(owner.id, 2500);
		await withUserId(owner.id, () =>
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
			UserCardRepository.findAllByUserIds({ userIds: [owner.id] }),
		);

		expect(findXpStat(userCards.get(owner.id))).toMatchObject({
			type: "XP",
			values: [{ isVerified: true, region: "WEST", points: 2500 }],
		});
	});

	it("ignores self-reported peak XP more than 200 above the verified XP", async () => {
		await insertVerifiedXp(owner.id, 2500);
		await withUserId(owner.id, () =>
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
			UserCardRepository.findAllByUserIds({ userIds: [owner.id] }),
		);

		expect(findXpStat(userCards.get(owner.id))).toMatchObject({
			type: "XP",
			values: [{ isVerified: true, region: "WEST", points: 2500 }],
		});
	});

	it("shows the verified peak XP of the picked division", async () => {
		await insertVerifiedXp(owner.id, 3010, "WEST");
		await insertVerifiedXp(owner.id, 3000, "JPN");
		await withUserId(owner.id, () =>
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
			UserCardRepository.findAllByUserIds({ userIds: [owner.id] }),
		);

		expect(findXpStat(userCards.get(owner.id))).toMatchObject({
			type: "XP",
			values: [{ isVerified: true, region: "JPN", points: 3000 }],
		});
	});

	it("shows the highest verified peak XP across divisions when none is picked", async () => {
		await insertVerifiedXp(owner.id, 3010, "WEST");
		await insertVerifiedXp(owner.id, 3000, "JPN");

		const { userCards } = await withNoUser(() =>
			UserCardRepository.findAllByUserIds({ userIds: [owner.id] }),
		);

		expect(findXpStat(userCards.get(owner.id))).toMatchObject({
			type: "XP",
			values: [{ isVerified: true, region: "WEST", points: 3010 }],
		});
	});

	it("falls back to the other division when the picked one has no placements", async () => {
		await insertVerifiedXp(owner.id, 3010, "WEST");
		await withUserId(owner.id, () =>
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
			UserCardRepository.findAllByUserIds({ userIds: [owner.id] }),
		);

		expect(findXpStat(userCards.get(owner.id))).toMatchObject({
			type: "XP",
			values: [{ isVerified: true, region: "WEST", points: 3010 }],
		});
	});

	it("judges self-reported peak XP against the picked division's verified XP", async () => {
		await insertVerifiedXp(owner.id, 3010, "WEST");
		await insertVerifiedXp(owner.id, 3000, "JPN");
		await withUserId(owner.id, () =>
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
			UserCardRepository.findAllByUserIds({ userIds: [owner.id] }),
		);

		// 3005 does not beat the 3010 of the other division, but that ladder is not the one shown
		expect(findXpStat(userCards.get(owner.id))).toMatchObject({
			type: "XP",
			values: [
				{ isVerified: false, region: "JPN", points: 3005 },
				{ isVerified: true, region: "JPN", points: 3000 },
			],
		});
	});

	it("ignores self-reported peak XP when there is no verified XP", async () => {
		await withUserId(owner.id, () =>
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
			UserCardRepository.findAllByUserIds({ userIds: [owner.id] }),
		);

		expect(findXpStat(userCards.get(owner.id))).toBeUndefined();
	});

	it("persists edited card fields and surfaces hidden stats", async () => {
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

	it("keeps hidden stats in `stats` when includeHiddenStats is set", async () => {
		await insertVerifiedXp(owner.id, 2500);

		await withUserId(owner.id, () =>
			UserCardRepository.updateOwnCard({
				shortBio: null,
				bannerPresetImg: null,
				bannerImgId: null,
				unverifiedPeakXP: null,
				xpDivision: null,
				hiddenCardStats: ["XP"],
			}),
		);

		const { userCards } = await withUserId(owner.id, () =>
			UserCardRepository.findAllByUserIds({
				userIds: [owner.id],
				includeHiddenStats: true,
			}),
		);
		const card = userCards.get(owner.id);

		expect(findXpStat(card)).toMatchObject({
			type: "XP",
			values: [{ isVerified: true, region: "WEST", points: 2500 }],
		});
	});

	it("produces a URL banner when an uploaded banner image is set", async () => {
		const image = await ImageFactory.create(
			{ submitterUserId: owner.id },
			{ isValidated: true },
		);

		await withUserId(owner.id, () =>
			UserCardRepository.updateOwnCard({
				shortBio: null,
				bannerPresetImg: null,
				bannerImgId: image.id,
				unverifiedPeakXP: null,
				xpDivision: null,
				hiddenCardStats: [],
			}),
		);

		const { userCards } = await withUserId(owner.id, () =>
			UserCardRepository.findAllByUserIds({
				userIds: [owner.id],
			}),
		);

		const banner = userCards.get(owner.id)?.banner;
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

	it("gives every viewer their own private note", async () => {
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

	it("serves cards from the cache and queries only the users missing from it", async () => {
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

	it("returns a fresh card once the cached one has expired", async () => {
		await cachedCard(target.id);

		await updateShortBioDirectly(target.id, "edited");
		UserCardRepository.clearUserCardCache();

		const { userCards } = await cachedCard(target.id);
		expect(userCards.get(target.id)?.shortBio).toBe("edited");
	});

	it("returns a fresh card right after its owner edited it", async () => {
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

	it("coalesces concurrent misses for the same user into one query", async () => {
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

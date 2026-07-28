import { beforeEach, describe, expect, it } from "vitest";
import * as ImageFactory from "~/db/seed/factories/ImageFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as XRankPlacementFactory from "~/db/seed/factories/XRankPlacementFactory";
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

	it("ignores self-reported peak XP when there is no verified XP", async () => {
		await withUserId(owner.id, () =>
			UserCardRepository.updateOwnCard({
				shortBio: null,
				bannerPresetImg: null,
				bannerImgId: null,
				unverifiedPeakXP: { overall: 3000, takoroka: 3000, tentatek: null },
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

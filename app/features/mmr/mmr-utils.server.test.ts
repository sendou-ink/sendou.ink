import { rating } from "openskill";
import { beforeEach, describe, expect, test } from "vitest";
import * as SkillFactory from "~/db/seed/factories/SkillFactory";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as Seasons from "./core/Seasons";
import { userIdsToIdentifier } from "./mmr-utils";
import { seasonRatings } from "./mmr-utils.server";

const SEASON = Seasons.currentOrPrevious()!.nth;

const users = UserFactory.pool();
const alphaIds = () => users.ids(4);
const bravoIds = () => users.ids().slice(4);

describe("seasonRatings", () => {
	beforeEach(async () => {
		await users.create(8);
	});

	test("a user who has played this season gets their rating and match count", async () => {
		await SkillFactory.create(
			{ userId: users.id(1), season: SEASON, mu: 30, sigma: 5 },
			{ matchesCount: 12 },
		);

		const ratings = await seasonRatings({
			season: SEASON,
			userIds: [users.id(1)],
			identifiers: [],
		});

		expect(ratings.user(users.id(1))).toEqual({
			rating: expect.objectContaining({ mu: 30, sigma: 5 }),
			matchesCount: 12,
		});
	});

	test("a user without a rating this season starts from the default with no matches", async () => {
		const ratings = await seasonRatings({
			season: SEASON,
			userIds: [users.id(1)],
			identifiers: [],
		});

		expect(ratings.user(users.id(1))).toEqual({
			rating: rating(),
			matchesCount: 0,
		});
	});

	test("a team that has played this season gets its rating and match count", async () => {
		await SQMatchFactory.create(
			{ alphaUserIds: alphaIds(), bravoUserIds: bravoIds() },
			{ isConcluded: true },
		);
		const identifier = userIdsToIdentifier(alphaIds());

		const ratings = await seasonRatings({
			season: SEASON,
			userIds: [],
			identifiers: [identifier],
		});
		const team = ratings.team(identifier);

		expect(team.matchesCount).toBe(1);
		expect(team.rating.mu).toBeGreaterThan(rating().mu);
	});

	test("a team that hasn't played this season starts from the default with no matches", async () => {
		const identifier = userIdsToIdentifier(alphaIds());

		const ratings = await seasonRatings({
			season: SEASON,
			userIds: [],
			identifiers: [identifier],
		});

		expect(ratings.team(identifier)).toEqual({
			rating: rating(),
			matchesCount: 0,
		});
	});

	test("a team's player average is the mean of its members' ratings", async () => {
		const memberRatings = [
			{ mu: 20, sigma: 2 },
			{ mu: 24, sigma: 4 },
			{ mu: 28, sigma: 6 },
			{ mu: 32, sigma: 8 },
		];
		for (const [i, memberRating] of memberRatings.entries()) {
			await SkillFactory.create({
				userId: users.id(i + 1),
				season: SEASON,
				...memberRating,
			});
		}

		const ratings = await seasonRatings({
			season: SEASON,
			userIds: alphaIds(),
			identifiers: [],
		});

		expect(ratings.teamPlayerAverage(userIdsToIdentifier(alphaIds()))).toEqual({
			mu: 26,
			sigma: 5,
		});
	});
});

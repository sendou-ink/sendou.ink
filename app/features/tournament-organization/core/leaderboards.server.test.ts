import { beforeEach, describe, expect, test } from "vitest";
import * as CalendarEventFactory from "~/db/seed/factories/CalendarEventFactory";
import * as CalendarEventResultFactory from "~/db/seed/factories/CalendarEventResultFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as TournamentOrganizationRepository from "../TournamentOrganizationRepository.server";
import { eventLeaderboards } from "./leaderboards.server";

const SERIES_SUBSTRING = "series";

const users = UserFactory.pool();
const authorId = () => users.id(1);

describe("eventLeaderboards", () => {
	let organizationId: number;

	beforeEach(async () => {
		await users.create(18);
		organizationId = (
			await TournamentOrganizationFactory.create({ ownerId: authorId() })
		).id;
	});

	const seedEvent = async (
		results: Array<{ placement: number; playerIds: Array<number | null> }>,
	) => {
		const { id: eventId } = await CalendarEventFactory.create({
			authorId: authorId(),
			organizationId,
			name: `${SERIES_SUBSTRING} event`,
		});

		await CalendarEventResultFactory.create({
			eventId,
			results: results.map((result, i) => ({
				teamName: `Team ${i + 1}`,
				placement: result.placement,
				players: result.playerIds.map((userId) => ({
					userId,
					name: userId ? null : "reported as text",
				})),
			})),
		});
	};

	const seedTournament = async (teamRosters: Array<Array<number>>) => {
		await TournamentFactory.createPlayed(
			{
				authorId: authorId(),
				organizationId,
				name: `${SERIES_SUBSTRING} tournament`,
				minMembersPerTeam: 1,
			},
			{ teamRosters, playedOut: "all" },
		);
	};

	const leaderboard = async () =>
		eventLeaderboards(
			await TournamentOrganizationRepository.findAllEventsBySeries({
				organizationId,
				substringMatches: [SERIES_SUBSTRING],
			}),
		);

	test("awards 4, 2 and 1 points for the podium places only", async () => {
		await seedEvent([
			{ placement: 1, playerIds: [users.id(1)] },
			{ placement: 2, playerIds: [users.id(2)] },
			{ placement: 3, playerIds: [users.id(3)] },
			{ placement: 4, playerIds: [users.id(4)] },
		]);

		const result = await leaderboard();

		expect(result.map((entry) => entry.user.id)).toEqual([
			users.id(1),
			users.id(2),
			users.id(3),
		]);
		expect(result.map((entry) => entry.points)).toEqual([
			"4.00",
			"2.00",
			"1.00",
		]);
	});

	test("splits the points of teams larger than four", async () => {
		await seedEvent([
			{ placement: 1, playerIds: users.ids(6) },
			{ placement: 2, playerIds: [users.id(1)] },
		]);

		const result = await leaderboard();

		expect(result[0].points).toBe("4.67");
		expect(result[1].points).toBe("2.67");
	});

	test("ignores players reported as plain text", async () => {
		await seedEvent([{ placement: 1, playerIds: [users.id(1), null, null] }]);

		const result = await leaderboard();

		expect(result).toHaveLength(1);
		expect(result[0].user.id).toBe(users.id(1));
	});

	test("sums points and placements across the events of the series", async () => {
		await seedEvent([{ placement: 1, playerIds: [users.id(1)] }]);
		await seedEvent([{ placement: 3, playerIds: [users.id(1)] }]);

		const result = await leaderboard();

		expect(result[0].points).toBe("5.00");
		expect(result[0].placements).toEqual({ first: 1, second: 0, third: 1 });
	});

	test("breaks a points tie by first places", async () => {
		await seedEvent([{ placement: 2, playerIds: [users.id(2)] }]);
		await seedEvent([{ placement: 2, playerIds: [users.id(2)] }]);
		await seedEvent([{ placement: 1, playerIds: [users.id(1)] }]);

		const result = await leaderboard();

		expect(result.map((entry) => entry.points)).toEqual(["4.00", "4.00"]);
		expect(result.map((entry) => entry.user.id)).toEqual([
			users.id(1),
			users.id(2),
		]);
	});

	test("breaks a points and first places tie by second places", async () => {
		await seedEvent([{ placement: 1, playerIds: [users.id(1)] }]);
		await seedEvent([{ placement: 3, playerIds: [users.id(1)] }]);
		await seedEvent([{ placement: 3, playerIds: [users.id(1)] }]);
		await seedEvent([{ placement: 1, playerIds: [users.id(2)] }]);
		await seedEvent([{ placement: 2, playerIds: [users.id(2)] }]);

		const result = await leaderboard();

		expect(result.map((entry) => entry.points)).toEqual(["6.00", "6.00"]);
		expect(result.map((entry) => entry.user.id)).toEqual([
			users.id(2),
			users.id(1),
		]);
	});

	test("breaks a points, first and second places tie by third places", async () => {
		const onceThirdIds = users.ids(18).slice(0, 6);
		const twiceThirdIds = users.ids(18).slice(6);

		await seedEvent([{ placement: 3, playerIds: onceThirdIds }]);
		await seedEvent([{ placement: 3, playerIds: twiceThirdIds }]);
		await seedEvent([{ placement: 3, playerIds: twiceThirdIds }]);

		const result = await leaderboard();

		expect(result.every((entry) => entry.points === "0.67")).toBe(true);
		expect(
			result
				.slice(0, twiceThirdIds.length)
				.map((entry) => entry.user.id)
				.sort(),
		).toEqual([...twiceThirdIds].sort());
	});

	test("scores the podium of a played tournament of the series", async () => {
		await seedTournament([[users.id(1)], [users.id(2)]]);

		const result = await leaderboard();

		expect(result.map((entry) => entry.user.id)).toEqual([
			users.id(1),
			users.id(2),
		]);
		expect(result.map((entry) => entry.points)).toEqual(["4.00", "2.00"]);
	});

	test("sums points and placements across tournaments and reported events", async () => {
		await seedTournament([[users.id(1)], [users.id(2)]]);
		await seedEvent([{ placement: 3, playerIds: [users.id(1)] }]);

		const result = await leaderboard();

		expect(result[0].user.id).toBe(users.id(1));
		expect(result[0].points).toBe("5.00");
		expect(result[0].placements).toEqual({ first: 1, second: 0, third: 1 });
	});
});

import { add } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import * as Seasons from "~/features/mmr/core/Seasons";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import { withUserId } from "~/utils/Test";
import * as SQMatchRepository from "./SQMatchRepository.server";

const setupMatch = async (options?: { createdAt?: Date }) => {
	const users = await UserFactory.createMany(FULL_GROUP_SIZE * 2);
	const alphaMembers = users.slice(0, FULL_GROUP_SIZE);
	const bravoMembers = users.slice(FULL_GROUP_SIZE);

	const match = await SQMatchFactory.create(
		{
			alphaUserIds: alphaMembers.map((member) => member.id),
			bravoUserIds: bravoMembers.map((member) => member.id),
		},
		options,
	);

	return {
		match,
		alphaGroupId: match.alphaGroup.id,
		bravoGroupId: match.bravoGroup.id,
		alphaMembers,
		bravoMembers,
	};
};

const fetchMapResults = async (matchId: number) => {
	return db
		.selectFrom("GroupMatchMap")
		.selectAll()
		.where("matchId", "=", matchId)
		.orderBy("index", "asc")
		.execute();
};

const fetchGroup = async (groupId: number) => {
	return db
		.selectFrom("Group")
		.selectAll()
		.where("id", "=", groupId)
		.executeTakeFirst();
};

const fetchSkills = async (matchId: number) => {
	return db
		.selectFrom("Skill")
		.selectAll()
		.where("groupMatchId", "=", matchId)
		.execute();
};

describe("lockMatchWithoutSkillChange", () => {
	test("inserts dummy skill to lock match", async () => {
		const { match } = await setupMatch();

		await SQMatchRepository.lockMatchWithoutSkillChange(match.id);

		const skills = await fetchSkills(match.id);
		expect(skills).toHaveLength(1);
		expect(skills[0].season).toBe(-1);
		expect(skills[0].mu).toBe(-1);
		expect(skills[0].sigma).toBe(-1);
		expect(skills[0].ordinal).toBe(-1);
		expect(skills[0].userId).toBeNull();
	});
});

describe("cancelMatch", () => {
	let setup: Awaited<ReturnType<typeof setupMatch>>;

	beforeEach(async () => {
		setup = await setupMatch();
	});

	test("first cancel report sets group inactive", async () => {
		const result = await withUserId(setup.alphaMembers[0].id, () =>
			SQMatchRepository.cancelMatch({
				matchId: setup.match.id,
			}),
		);

		expect(result.status).toBe("CANCEL_REPORTED");
		expect(result.shouldRefreshCaches).toBe(false);

		const alphaGroup = await fetchGroup(setup.alphaGroupId);
		expect(alphaGroup?.status).toBe("INACTIVE");
	});

	test("matching cancel confirms and locks match", async () => {
		await withUserId(setup.alphaMembers[0].id, () =>
			SQMatchRepository.cancelMatch({
				matchId: setup.match.id,
			}),
		);

		const result = await withUserId(setup.bravoMembers[0].id, () =>
			SQMatchRepository.cancelMatch({
				matchId: setup.match.id,
			}),
		);

		expect(result.status).toBe("CANCEL_CONFIRMED");
		expect(result.shouldRefreshCaches).toBe(true);

		const alphaGroup = await fetchGroup(setup.alphaGroupId);
		const bravoGroup = await fetchGroup(setup.bravoGroupId);
		expect(alphaGroup?.status).toBe("INACTIVE");
		expect(bravoGroup?.status).toBe("INACTIVE");

		const skills = await fetchSkills(setup.match.id);
		expect(skills).toHaveLength(1);
		expect(skills[0].season).toBe(-1);
	});

	test("cant cancel after score reported", async () => {
		await SQMatchRepository.reportMapWinner({
			matchId: setup.match.id,
			winnerId: setup.alphaGroupId,
			reportedByUserId: setup.alphaMembers[0].id,
			reportedCount: 0,
		});

		const result = await withUserId(setup.bravoMembers[0].id, () =>
			SQMatchRepository.cancelMatch({
				matchId: setup.match.id,
			}),
		);

		expect(result.status).toBe("CANT_CANCEL");
		expect(result.shouldRefreshCaches).toBe(false);
	});

	test("admin cancel locks match without applying SP changes", async () => {
		const result = await withUserId(setup.alphaMembers[0].id, () =>
			SQMatchRepository.cancelMatch({
				matchId: setup.match.id,
				isAdminReport: true,
			}),
		);

		expect(result.status).toBe("CANCEL_CONFIRMED");
		expect(result.shouldRefreshCaches).toBe(true);

		const alphaGroup = await fetchGroup(setup.alphaGroupId);
		const bravoGroup = await fetchGroup(setup.bravoGroupId);
		expect(alphaGroup?.status).toBe("INACTIVE");
		expect(bravoGroup?.status).toBe("INACTIVE");

		const skills = await fetchSkills(setup.match.id);
		const realSkills = skills.filter((s) => s.season !== -1);
		expect(realSkills).toHaveLength(0);
		expect(skills).toHaveLength(1);
		expect(skills[0].season).toBe(-1);

		const maps = await fetchMapResults(setup.match.id);
		for (const map of maps) {
			expect(map.winnerGroupId).toBeNull();
		}
	});

	test("admin cancel deletes a pending cancel request's report", async () => {
		await SQMatchRepository.requestCancelMatch({
			matchId: setup.match.id,
			requestedByUserId: setup.alphaMembers[0].id,
			reason: "Reason",
			nominatedUserIds: [setup.bravoMembers[0].id],
		});

		const result = await withUserId(setup.alphaMembers[0].id, () =>
			SQMatchRepository.cancelMatch({
				matchId: setup.match.id,
				isAdminReport: true,
			}),
		);

		expect(result.status).toBe("CANCEL_CONFIRMED");
		expect(await fetchCancelReports(setup.match.id)).toHaveLength(0);

		const match = await SQMatchRepository.findById(setup.match.id);
		expect(match?.cancelRequestedByUserId).toBeNull();
	});
});

const fetchCancelReports = async (matchId: number) => {
	return db
		.selectFrom("GroupMatchCancelReport")
		.selectAll()
		.where("groupMatchId", "=", matchId)
		.orderBy("id", "asc")
		.execute();
};

const cancelMatchViaBothTeams = async (
	setup: Awaited<ReturnType<typeof setupMatch>>,
	{ nominatedUserIds }: { nominatedUserIds: number[] },
) => {
	await SQMatchRepository.requestCancelMatch({
		matchId: setup.match.id,
		requestedByUserId: setup.alphaMembers[0].id,
		reason: "Requester reason",
		nominatedUserIds,
	});
	await SQMatchRepository.acceptCancelMatch({
		matchId: setup.match.id,
		acceptedByUserId: setup.bravoMembers[0].id,
		reason: "Accepter reason",
		nominatedUserIds,
	});
};

describe("requestCancelMatch", () => {
	test("stores the requesting team's cancel report with nominated players", async () => {
		const setup = await setupMatch();
		const nominated = [setup.alphaMembers[0].id, setup.bravoMembers[1].id];

		const result = await SQMatchRepository.requestCancelMatch({
			matchId: setup.match.id,
			requestedByUserId: setup.alphaMembers[0].id,
			reason: "Disconnect on both sides",
			nominatedUserIds: nominated,
		});

		expect(result.status).toBe("REQUESTED");

		const reports = await SQMatchRepository.findCancelReportsByGroupMatchId(
			setup.match.id,
		);
		expect(reports).toHaveLength(1);
		expect(reports[0].groupId).toBe(setup.alphaGroupId);
		expect(reports[0].authorUserId).toBe(setup.alphaMembers[0].id);
		expect(reports[0].reason).toBe("Disconnect on both sides");
		expect(reports[0].nominatedPlayers.map((p) => p.userId).sort()).toEqual(
			nominated.sort(),
		);
	});

	test("second request does not duplicate the report", async () => {
		const setup = await setupMatch();

		await SQMatchRepository.requestCancelMatch({
			matchId: setup.match.id,
			requestedByUserId: setup.alphaMembers[0].id,
			reason: "First",
			nominatedUserIds: [setup.alphaMembers[0].id],
		});
		const result = await SQMatchRepository.requestCancelMatch({
			matchId: setup.match.id,
			requestedByUserId: setup.alphaMembers[1].id,
			reason: "Second",
			nominatedUserIds: [setup.alphaMembers[1].id],
		});

		expect(result.status).toBe("ALREADY_REQUESTED");
		expect(await fetchCancelReports(setup.match.id)).toHaveLength(1);
	});
});

describe("refuseCancelMatch", () => {
	test("deletes the requester's cancel report", async () => {
		const setup = await setupMatch();

		await SQMatchRepository.requestCancelMatch({
			matchId: setup.match.id,
			requestedByUserId: setup.alphaMembers[0].id,
			reason: "Reason",
			nominatedUserIds: [setup.alphaMembers[0].id],
		});
		const result = await SQMatchRepository.refuseCancelMatch({
			matchId: setup.match.id,
			refusedByUserId: setup.bravoMembers[0].id,
		});

		expect(result.status).toBe("REFUSED");
		expect(await fetchCancelReports(setup.match.id)).toHaveLength(0);
	});
});

describe("acceptCancelMatch", () => {
	test("stores the accepting team's cancel report and locks the match", async () => {
		const setup = await setupMatch();

		await SQMatchRepository.requestCancelMatch({
			matchId: setup.match.id,
			requestedByUserId: setup.alphaMembers[0].id,
			reason: "Requester reason",
			nominatedUserIds: [setup.bravoMembers[0].id],
		});
		const result = await SQMatchRepository.acceptCancelMatch({
			matchId: setup.match.id,
			acceptedByUserId: setup.bravoMembers[0].id,
			reason: "Accepter reason",
			nominatedUserIds: [setup.bravoMembers[0].id, setup.bravoMembers[1].id],
		});

		expect(result.status).toBe("ACCEPTED");

		const skills = await fetchSkills(setup.match.id);
		expect(skills).toHaveLength(1);
		expect(skills[0].season).toBe(-1);

		const reports = await SQMatchRepository.findCancelReportsByGroupMatchId(
			setup.match.id,
		);
		expect(reports).toHaveLength(2);
		// requester's report first
		expect(reports[0].groupId).toBe(setup.alphaGroupId);
		expect(reports[1].groupId).toBe(setup.bravoGroupId);
		expect(reports[1].reason).toBe("Accepter reason");
		expect(reports[1].nominatedPlayers.map((p) => p.userId).sort()).toEqual(
			[setup.bravoMembers[0].id, setup.bravoMembers[1].id].sort(),
		);
	});
});

describe("finalizeMatch", () => {
	test("playing the match out normally deletes a pending cancel request's report", async () => {
		const setup = await setupMatch();

		await SQMatchRepository.requestCancelMatch({
			matchId: setup.match.id,
			requestedByUserId: setup.alphaMembers[0].id,
			reason: "Reason",
			nominatedUserIds: [setup.alphaMembers[0].id],
		});

		let reportedCount = 0;
		let result = await SQMatchRepository.reportMapWinner({
			matchId: setup.match.id,
			winnerId: setup.alphaGroupId,
			reportedByUserId: setup.alphaMembers[0].id,
			reportedCount,
		});
		while (result.status === "MAP_REPORTED") {
			reportedCount++;
			result = await SQMatchRepository.reportMapWinner({
				matchId: setup.match.id,
				winnerId: setup.alphaGroupId,
				reportedByUserId: setup.alphaMembers[0].id,
				reportedCount,
			});
		}
		expect(result.status).toBe("MATCH_REPORTED");

		const confirmation = await SQMatchRepository.reportMapWinner({
			matchId: setup.match.id,
			winnerId: setup.alphaGroupId,
			reportedByUserId: setup.bravoMembers[0].id,
			reportedCount: reportedCount + 1,
		});
		expect(confirmation.status).toBe("MATCH_FINALIZED");

		expect(await fetchCancelReports(setup.match.id)).toHaveLength(0);
	});
});

describe("findCancelNominationCountsByUserIds", () => {
	test("counts distinct finalized cancellations within season and calendar year", async () => {
		const season = Seasons.currentOrPrevious()!;
		const matchDate = add(season.starts, { days: 1 });
		const expectedYearCount =
			matchDate.getFullYear() === new Date().getFullYear() ? 2 : 0;

		const first = await setupMatch({ createdAt: matchDate });
		const nominatedUserId = first.bravoMembers[0].id;
		// both teams nominating the same player still counts the match once
		await cancelMatchViaBothTeams(first, {
			nominatedUserIds: [nominatedUserId],
		});

		const second = await SQMatchFactory.create(
			{
				alphaUserIds: first.alphaMembers.map((member) => member.id),
				bravoUserIds: first.bravoMembers.map((member) => member.id),
			},
			{ createdAt: matchDate },
		);
		await SQMatchRepository.requestCancelMatch({
			matchId: second.id,
			requestedByUserId: first.alphaMembers[0].id,
			reason: "Reason",
			nominatedUserIds: [nominatedUserId],
		});
		await SQMatchRepository.acceptCancelMatch({
			matchId: second.id,
			acceptedByUserId: first.bravoMembers[0].id,
			reason: "Reason",
			nominatedUserIds: [first.bravoMembers[1].id],
		});

		// a pending (not accepted) cancel request does not count
		const third = await setupMatch({ createdAt: matchDate });
		await SQMatchRepository.requestCancelMatch({
			matchId: third.match.id,
			requestedByUserId: third.alphaMembers[0].id,
			reason: "Reason",
			nominatedUserIds: [nominatedUserId, third.alphaMembers[0].id],
		});

		const counts = await SQMatchRepository.findCancelNominationCountsByUserIds({
			userIds: [nominatedUserId, first.bravoMembers[1].id],
			season: season.nth,
		});

		expect(counts).toEqual([
			{
				userId: nominatedUserId,
				seasonCount: 2,
				yearCount: expectedYearCount,
			},
			{
				userId: first.bravoMembers[1].id,
				seasonCount: 1,
				yearCount: expectedYearCount === 0 ? 0 : 1,
			},
		]);
	});
});

describe("findSeasonCanceledMatchesByUserId", () => {
	test("includes both teams' cancel reports with nominated players", async () => {
		const season = Seasons.currentOrPrevious()!;
		const matchDate = add(season.starts, { days: 1 });

		const setup = await setupMatch({ createdAt: matchDate });
		await cancelMatchViaBothTeams(setup, {
			nominatedUserIds: [setup.bravoMembers[0].id],
		});

		const canceledMatches =
			await SQMatchRepository.findSeasonCanceledMatchesByUserId({
				userId: setup.alphaMembers[0].id,
				season: season.nth,
			});

		expect(canceledMatches).toHaveLength(1);
		expect(canceledMatches[0].id).toBe(setup.match.id);
		expect(canceledMatches[0].cancelReports).toHaveLength(2);
		const usernameOf = async (userId: number) => {
			const row = await db
				.selectFrom("User")
				.select("username")
				.where("id", "=", userId)
				.executeTakeFirstOrThrow();
			return row.username;
		};

		expect(canceledMatches[0].cancelReports[0].authorUsername).toBe(
			await usernameOf(setup.alphaMembers[0].id),
		);
		expect(canceledMatches[0].cancelReports[1].authorUsername).toBe(
			await usernameOf(setup.bravoMembers[0].id),
		);
		expect(canceledMatches[0].cancelReports[1].nominatedPlayers).toEqual([
			{
				id: setup.bravoMembers[0].id,
				username: await usernameOf(setup.bravoMembers[0].id),
			},
		]);
	});
});

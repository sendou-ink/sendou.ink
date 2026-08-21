import { add, sub } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as SplatoonFaker from "~/db/seed/core/SplatoonFaker";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import * as Seasons from "~/features/mmr/core/Seasons";
import {
	FULL_GROUP_SIZE,
	SENDOUQ_BEST_OF,
} from "~/features/sendouq/q-constants";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import type { TournamentSummary } from "~/features/tournament-bracket/core/summarizer.server";
import invariant from "~/utils/invariant";
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

/** Reports every map as won by alpha and has bravo confirm the score. */
const playOutMatch = async (setup: Awaited<ReturnType<typeof setupMatch>>) => {
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

	return SQMatchRepository.reportMapWinner({
		matchId: setup.match.id,
		winnerId: setup.alphaGroupId,
		reportedByUserId: setup.bravoMembers[0].id,
		reportedCount: reportedCount + 1,
	});
};

describe("insert", () => {
	test("deletes the matched groups' pending likes and suggestions", async () => {
		const users = await UserFactory.createMany(FULL_GROUP_SIZE * 2 + 1);
		const alphaMembers = users.slice(0, FULL_GROUP_SIZE);
		const bravoMembers = users.slice(FULL_GROUP_SIZE, FULL_GROUP_SIZE * 2);
		const bystander = users[FULL_GROUP_SIZE * 2];

		const alphaGroup = await SQGroupFactory.create({
			memberUserIds: alphaMembers.map((member) => member.id),
		});
		const bravoGroup = await SQGroupFactory.create({
			memberUserIds: bravoMembers.map((member) => member.id),
		});
		const bystanderGroup = await SQGroupFactory.create({
			memberUserIds: [bystander.id],
		});

		await SQGroupRepository.insertLike({
			likerGroupId: bystanderGroup.id,
			targetGroupId: alphaGroup.id,
			createdByUserId: bystander.id,
		});
		await SQGroupRepository.insertLike({
			likerGroupId: bravoGroup.id,
			targetGroupId: bystanderGroup.id,
			createdByUserId: bravoMembers[0].id,
		});
		await SQGroupRepository.insertSuggestion({
			suggesterGroupId: alphaGroup.id,
			targetGroupId: bystanderGroup.id,
			createdByUserId: alphaMembers[0].id,
		});

		await SQMatchRepository.insert({
			alphaGroupId: alphaGroup.id,
			bravoGroupId: bravoGroup.id,
			mapList: SplatoonFaker.mapList(SENDOUQ_BEST_OF).map((map) => ({
				...map,
				source: "BOTH" as const,
			})),
			tiers: { groups: [] },
		});

		const likes = await db.selectFrom("GroupLike").selectAll().execute();
		const suggestions = await db
			.selectFrom("GroupSuggestion")
			.selectAll()
			.execute();

		expect(likes).toHaveLength(0);
		expect(suggestions).toHaveLength(0);
	});
});

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

		const confirmation = await playOutMatch(setup);
		expect(confirmation.status).toBe("MATCH_FINALIZED");

		expect(await fetchCancelReports(setup.match.id)).toHaveLength(0);
	});

	test("attributes the match to the season it was created in, not the one it is reported in", async () => {
		const reportingSeason = Seasons.currentOrPrevious()!;
		const matchSeason = Seasons.previous(reportingSeason.starts)!;

		const setup = await setupMatch({
			createdAt: sub(matchSeason.ends, { hours: 1 }),
		});

		const confirmation = await playOutMatch(setup);
		expect(confirmation.status).toBe("MATCH_FINALIZED");

		const skills = await fetchSkills(setup.match.id);
		expect(skills).not.toHaveLength(0);
		expect(skills.map((skill) => skill.season)).toEqual(
			skills.map(() => matchSeason.nth),
		);

		const mapResults = await db
			.selectFrom("MapResult")
			.selectAll()
			.where("userId", "=", setup.alphaMembers[0].id)
			.execute();
		expect(mapResults).not.toHaveLength(0);
		expect(mapResults.map((result) => result.season)).toEqual(
			mapResults.map(() => matchSeason.nth),
		);

		const playerResults = await db
			.selectFrom("PlayerResult")
			.selectAll()
			.where("ownerUserId", "=", setup.alphaMembers[0].id)
			.execute();
		expect(playerResults).not.toHaveLength(0);
		expect(playerResults.map((result) => result.season)).toEqual(
			playerResults.map(() => matchSeason.nth),
		);
	});

	// Demonstrates a bug: reportMapWinner checks the match lock on a snapshot read
	// outside the finalizing transaction, so two teammates confirming the score at
	// the same time both finalize. Rating/stat changes get applied twice.
	test("concurrent score confirmations finalize the match only once", async () => {
		const setup = await setupMatch();

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

		const skillsBeforeConfirm = await fetchSkills(setup.match.id);

		const [first, second] = await Promise.all([
			SQMatchRepository.reportMapWinner({
				matchId: setup.match.id,
				winnerId: setup.alphaGroupId,
				reportedByUserId: setup.bravoMembers[0].id,
				reportedCount: reportedCount + 1,
			}),
			SQMatchRepository.reportMapWinner({
				matchId: setup.match.id,
				winnerId: setup.alphaGroupId,
				reportedByUserId: setup.bravoMembers[1].id,
				reportedCount: reportedCount + 1,
			}),
		]);

		const finalizedCount = [first, second].filter(
			(r) => r.status === "MATCH_FINALIZED",
		).length;
		expect(finalizedCount).toBe(1);

		const skillsAfterConfirm = await fetchSkills(setup.match.id);
		const skillsFromThisFinalization =
			skillsAfterConfirm.length - skillsBeforeConfirm.length;
		expect(skillsFromThisFinalization).toBe(FULL_GROUP_SIZE * 2 + 2);
	});
});

describe("undoMatchReport", () => {
	// intended: the group stays INACTIVE after an undo so it can't re-enter the
	// queue while the disagreement is unresolved; the teams keep playing and
	// staff resolve the match when available
	test("keeps the reporter's group INACTIVE after undoing a set-ending report", async () => {
		const setup = await setupMatch();

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
		expect((await fetchGroup(setup.alphaGroupId))?.status).toBe("INACTIVE");

		const undoResult = await SQMatchRepository.undoMatchReport({
			matchId: setup.match.id,
			requestedByUserId: setup.alphaMembers[0].id,
		});
		expect(undoResult.status).toBe("SUCCESS");

		expect((await fetchGroup(setup.alphaGroupId))?.status).toBe("INACTIVE");
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

describe("findSeasonResultsByUserId", () => {
	const SEASON = 0;
	const RANKED_MATCHES = 7;

	const seasonUsers = UserFactory.pool();
	const rosterUserIds = () => [1, 2, 3, 4].map((nth) => seasonUsers.id(nth));
	/** The roster the actor gets when their team subs the 4th member out mid-tournament. */
	const subbedRosterUserIds = () =>
		[1, 2, 3, 5].map((nth) => seasonUsers.id(nth));
	const actorId = () => seasonUsers.id(1);

	beforeEach(async () => {
		await seasonUsers.create(5);
	});

	/**
	 * Finalizes a tournament that moved the actor's rating to `ordinal` and each of
	 * `rosters` to its `ordinal`, counting the given `matchesCount` of sets towards each.
	 */
	const finalizeTournament = async ({
		ordinal,
		matchesCount,
		rosters = [],
	}: {
		ordinal: number;
		matchesCount: number;
		rosters?: Array<{
			ordinal: number;
			matchesCount: number;
			/** Defaults to {@link rosterUserIds}. */
			userIds?: number[];
		}>;
	}) => {
		const { id: tournamentId } = await TournamentFactory.create({
			authorId: actorId(),
		});
		const { id: tournamentTeamId } = await TournamentTeamFactory.create({
			tournamentId,
			memberUserIds: [actorId()],
		});

		const skills: TournamentSummary["skills"] = [
			{
				userId: actorId(),
				identifier: null,
				mu: ordinal,
				sigma: 0,
				matchesCount,
			},
			...rosters.map((roster) => ({
				userId: null,
				identifier: (roster.userIds ?? rosterUserIds()).join(
					"-",
				) as `${number}-${number}-${number}-${number}`,
				mu: roster.ordinal,
				sigma: 0,
				matchesCount: roster.matchesCount,
			})),
		];

		await TournamentRepository.finalize({
			tournamentId,
			season: SEASON,
			summary: {
				skills,
				seedingSkills: [],
				mapResultDeltas: [],
				playerResultDeltas: [],
				tournamentResults: [
					{
						userId: actorId(),
						placement: 1,
						participantCount: 1,
						tournamentTeamId,
						div: null,
					},
				],
				setResults: new Map([[actorId(), ["W"]]]),
			},
		});

		return tournamentId;
	};

	const latestResult = async () => {
		const rows = await SQMatchRepository.findSeasonResultsByUserId({
			userId: actorId(),
			season: SEASON,
			page: 1,
		});

		const result = rows[0];
		invariant(
			result?.type === "TOURNAMENT_RESULT",
			"expected a tournament result",
		);

		return result.tournamentResult;
	};

	test("leaves out the SP change while the rating is still being calculated", async () => {
		await finalizeTournament({ ordinal: 1, matchesCount: 1 });

		expect((await latestResult()).spDiff).toBeNull();
	});

	test("derives the SP change from the rating the tournament replaced", async () => {
		await finalizeTournament({ ordinal: 1, matchesCount: RANKED_MATCHES });
		await finalizeTournament({ ordinal: 3, matchesCount: 1 });

		// ordinal 1 -> 3, and an ordinal is worth 15SP
		expect((await latestResult()).spDiff).toBe(30);
	});

	test("leaves out the roster's SP until the roster is ranked", async () => {
		await finalizeTournament({
			ordinal: 1,
			matchesCount: RANKED_MATCHES,
			rosters: [{ ordinal: 1, matchesCount: 1 }],
		});

		expect((await latestResult()).teamSp).toBeNull();
	});

	test("shows the roster's SP without a change the tournament it becomes ranked", async () => {
		await finalizeTournament({
			ordinal: 1,
			matchesCount: RANKED_MATCHES,
			rosters: [{ ordinal: 2, matchesCount: RANKED_MATCHES }],
		});

		const result = await latestResult();
		expect(result.teamSp).toBe(1030);
		expect(result.teamSpDiff).toBeNull();
	});

	test("derives the roster's SP change once the roster is ranked", async () => {
		await finalizeTournament({
			ordinal: 1,
			matchesCount: RANKED_MATCHES,
			rosters: [{ ordinal: 2, matchesCount: RANKED_MATCHES }],
		});
		await finalizeTournament({
			ordinal: 1,
			matchesCount: 1,
			rosters: [{ ordinal: 4, matchesCount: 1 }],
		});

		const result = await latestResult();
		expect(result.teamSp).toBe(1060);
		expect(result.teamSpDiff).toBe(30);
	});

	test("picks the roster the user played the most sets of the tournament with", async () => {
		// both rosters ranked going in, so only the sets played this tournament decide
		await finalizeTournament({
			ordinal: 1,
			matchesCount: RANKED_MATCHES,
			rosters: [{ ordinal: 2, matchesCount: RANKED_MATCHES }],
		});
		await finalizeTournament({
			ordinal: 1,
			matchesCount: RANKED_MATCHES,
			rosters: [
				{
					userIds: subbedRosterUserIds(),
					ordinal: 4,
					matchesCount: RANKED_MATCHES,
				},
			],
		});

		await finalizeTournament({
			ordinal: 1,
			matchesCount: 3,
			rosters: [
				{ ordinal: 3, matchesCount: 3 },
				{ userIds: subbedRosterUserIds(), ordinal: 6, matchesCount: 1 },
			],
		});

		const result = await latestResult();
		expect(result.teamSp).toBe(1045);
		expect(result.teamSpDiff).toBe(15);
	});

	test("leaves out the roster's SP when the roster the most sets were played with is unranked", async () => {
		await finalizeTournament({
			ordinal: 1,
			matchesCount: RANKED_MATCHES,
			rosters: [
				{
					userIds: subbedRosterUserIds(),
					ordinal: 2,
					matchesCount: RANKED_MATCHES,
				},
			],
		});

		await finalizeTournament({
			ordinal: 1,
			matchesCount: RANKED_MATCHES - 2,
			rosters: [
				// brand new roster, so still unranked despite the majority of the sets
				{ ordinal: 3, matchesCount: RANKED_MATCHES - 2 },
				{ userIds: subbedRosterUserIds(), ordinal: 6, matchesCount: 1 },
			],
		});

		const result = await latestResult();
		expect(result.teamSp).toBeNull();
		expect(result.teamSpDiff).toBeNull();
	});
});

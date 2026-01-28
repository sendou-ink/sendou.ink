import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { db } from "~/db/sql";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import * as SQGroupRepository from "../sendouq/SQGroupRepository.server";
import * as SQMatchRepository from "./SQMatchRepository.server";

const { mockSeasonCurrentOrPrevious } = vi.hoisted(() => ({
	mockSeasonCurrentOrPrevious: vi.fn(() => ({
		nth: 1,
		starts: new Date("2023-01-01"),
		ends: new Date("2030-12-31"),
	})),
}));

vi.mock("~/features/mmr/core/Seasons", () => ({
	currentOrPrevious: mockSeasonCurrentOrPrevious,
}));

const createGroup = async (userIds: number[]) => {
	const groupResult = await SQGroupRepository.createGroup({
		status: "ACTIVE",
		userId: userIds[0],
	});

	for (let i = 1; i < userIds.length; i++) {
		await SQGroupRepository.addMember(groupResult.id, {
			userId: userIds[i],
			role: "REGULAR",
		});
	}

	return groupResult.id;
};

const createMatch = async (alphaGroupId: number, bravoGroupId: number) => {
	const match = await db
		.insertInto("GroupMatch")
		.values({
			alphaGroupId,
			bravoGroupId,
			chatCode: "test-chat-code",
		})
		.returningAll()
		.executeTakeFirstOrThrow();

	const mapList: Array<{
		mode: ModeShort;
		stageId: StageId;
	}> = [
		{ mode: "SZ", stageId: 1 },
		{ mode: "TC", stageId: 2 },
		{ mode: "RM", stageId: 3 },
		{ mode: "CB", stageId: 4 },
		{ mode: "SZ", stageId: 5 },
		{ mode: "TC", stageId: 6 },
		{ mode: "RM", stageId: 7 },
	];

	await db
		.insertInto("GroupMatchMap")
		.values(
			mapList.map((map, i) => ({
				matchId: match.id,
				index: i,
				mode: map.mode,
				stageId: map.stageId,
				source: "TIEBREAKER",
			})),
		)
		.execute();

	return match;
};

const fetchMatch = async (matchId: number) => {
	return db
		.selectFrom("GroupMatch")
		.selectAll()
		.where("id", "=", matchId)
		.executeTakeFirst();
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

const fetchReportedWeapons = async (matchId: number) => {
	return db
		.selectFrom("ReportedWeapon")
		.innerJoin(
			"GroupMatchMap",
			"GroupMatchMap.id",
			"ReportedWeapon.groupMatchMapId",
		)
		.selectAll("ReportedWeapon")
		.where("GroupMatchMap.matchId", "=", matchId)
		.execute();
};

describe("updateScore", () => {
	beforeEach(async () => {
		await dbInsertUsers(8);
	});

	afterEach(() => {
		dbReset();
	});

	test("updates match reportedAt and reportedByUserId", async () => {
		const alphaGroupId = await createGroup([1, 2, 3, 4]);
		const bravoGroupId = await createGroup([5, 6, 7, 8]);
		const match = await createMatch(alphaGroupId, bravoGroupId);

		await SQMatchRepository.updateScore({
			matchId: match.id,
			reportedByUserId: 1,
			winners: ["ALPHA", "ALPHA", "BRAVO", "ALPHA"],
		});

		const updatedMatch = await fetchMatch(match.id);
		expect(updatedMatch?.reportedAt).not.toBeNull();
		expect(updatedMatch?.reportedByUserId).toBe(1);
	});

	test("sets winners correctly for each map", async () => {
		const alphaGroupId = await createGroup([1, 2, 3, 4]);
		const bravoGroupId = await createGroup([5, 6, 7, 8]);
		const match = await createMatch(alphaGroupId, bravoGroupId);

		await SQMatchRepository.updateScore({
			matchId: match.id,
			reportedByUserId: 1,
			winners: ["ALPHA", "BRAVO", "ALPHA", "BRAVO"],
		});

		const maps = await fetchMapResults(match.id);
		expect(maps[0].winnerGroupId).toBe(alphaGroupId);
		expect(maps[1].winnerGroupId).toBe(bravoGroupId);
		expect(maps[2].winnerGroupId).toBe(alphaGroupId);
		expect(maps[3].winnerGroupId).toBe(bravoGroupId);
		expect(maps[4].winnerGroupId).toBeNull();
	});

	test("clears previous winners before setting new ones", async () => {
		const alphaGroupId = await createGroup([1, 2, 3, 4]);
		const bravoGroupId = await createGroup([5, 6, 7, 8]);
		const match = await createMatch(alphaGroupId, bravoGroupId);

		await SQMatchRepository.updateScore({
			matchId: match.id,
			reportedByUserId: 1,
			winners: ["ALPHA", "ALPHA", "ALPHA", "ALPHA"],
		});

		await SQMatchRepository.updateScore({
			matchId: match.id,
			reportedByUserId: 5,
			winners: ["BRAVO", "BRAVO", "BRAVO", "BRAVO"],
		});

		const maps = await fetchMapResults(match.id);
		for (let i = 0; i < 4; i++) {
			expect(maps[i].winnerGroupId).toBe(bravoGroupId);
		}
	});
});

describe("lockMatchWithoutSkillChange", () => {
	beforeEach(async () => {
		await dbInsertUsers(8);
	});

	afterEach(() => {
		dbReset();
	});

	test("inserts dummy skill to lock match", async () => {
		const alphaGroupId = await createGroup([1, 2, 3, 4]);
		const bravoGroupId = await createGroup([5, 6, 7, 8]);
		const match = await createMatch(alphaGroupId, bravoGroupId);

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

describe("adminReport", () => {
	beforeEach(async () => {
		await dbInsertUsers(8);
	});

	afterEach(() => {
		dbReset();
	});

	test("sets both groups as inactive", async () => {
		const alphaGroupId = await createGroup([1, 2, 3, 4]);
		const bravoGroupId = await createGroup([5, 6, 7, 8]);
		const match = await createMatch(alphaGroupId, bravoGroupId);

		await SQMatchRepository.adminReport({
			matchId: match.id,
			reportedByUserId: 1,
			winners: ["ALPHA", "ALPHA", "BRAVO", "ALPHA"],
		});

		const alphaGroup = await fetchGroup(alphaGroupId);
		const bravoGroup = await fetchGroup(bravoGroupId);
		expect(alphaGroup?.status).toBe("INACTIVE");
		expect(bravoGroup?.status).toBe("INACTIVE");

		const updatedMatch = await fetchMatch(match.id);
		expect(updatedMatch?.reportedAt).not.toBeNull();
	});

	test("creates skills to lock the match", async () => {
		const alphaGroupId = await createGroup([1, 2, 3, 4]);
		const bravoGroupId = await createGroup([5, 6, 7, 8]);
		const match = await createMatch(alphaGroupId, bravoGroupId);

		await SQMatchRepository.adminReport({
			matchId: match.id,
			reportedByUserId: 1,
			winners: ["ALPHA", "ALPHA", "BRAVO", "ALPHA"],
		});

		const skills = await fetchSkills(match.id);
		expect(skills.length).toBeGreaterThan(0);
	});
});

describe("reportScore", () => {
	beforeEach(async () => {
		await dbInsertUsers(8);
	});

	afterEach(() => {
		dbReset();
	});

	test("first report sets reporter group as inactive", async () => {
		const alphaGroupId = await createGroup([1, 2, 3, 4]);
		const bravoGroupId = await createGroup([5, 6, 7, 8]);
		const match = await createMatch(alphaGroupId, bravoGroupId);

		const groupMatchMaps = await db
			.selectFrom("GroupMatchMap")
			.select(["id", "index"])
			.where("matchId", "=", match.id)
			.orderBy("index", "asc")
			.execute();

		const result = await SQMatchRepository.reportScore({
			matchId: match.id,
			reportedByUserId: 1,
			winners: ["ALPHA", "ALPHA", "BRAVO", "ALPHA"],
			weapons: [
				{
					groupMatchMapId: groupMatchMaps[0].id,
					weaponSplId: 40,
					userId: 1,
					mapIndex: 0,
				},
			],
		});

		expect(result.status).toBe("REPORTED");
		expect(result.shouldRefreshCaches).toBe(false);

		const alphaGroup = await fetchGroup(alphaGroupId);
		expect(alphaGroup?.status).toBe("INACTIVE");

		const bravoGroup = await fetchGroup(bravoGroupId);
		expect(bravoGroup?.status).toBe("ACTIVE");

		const weapons = await fetchReportedWeapons(match.id);
		expect(weapons).toHaveLength(1);
	});

	test("matching second report confirms score and creates skills", async () => {
		const alphaGroupId = await createGroup([1, 2, 3, 4]);
		const bravoGroupId = await createGroup([5, 6, 7, 8]);
		const match = await createMatch(alphaGroupId, bravoGroupId);

		await SQMatchRepository.reportScore({
			matchId: match.id,
			reportedByUserId: 1,
			winners: ["ALPHA", "ALPHA", "BRAVO", "ALPHA"],
			weapons: [],
		});

		const result = await SQMatchRepository.reportScore({
			matchId: match.id,
			reportedByUserId: 5,
			winners: ["ALPHA", "ALPHA", "BRAVO", "ALPHA"],
			weapons: [],
		});

		expect(result.status).toBe("CONFIRMED");
		expect(result.shouldRefreshCaches).toBe(true);

		const skills = await fetchSkills(match.id);
		expect(skills.length).toBeGreaterThan(0);
	});

	test("different score returns DIFFERENT status", async () => {
		const alphaGroupId = await createGroup([1, 2, 3, 4]);
		const bravoGroupId = await createGroup([5, 6, 7, 8]);
		const match = await createMatch(alphaGroupId, bravoGroupId);

		await SQMatchRepository.reportScore({
			matchId: match.id,
			reportedByUserId: 1,
			winners: ["ALPHA", "ALPHA", "BRAVO", "ALPHA"],
			weapons: [],
		});

		const result = await SQMatchRepository.reportScore({
			matchId: match.id,
			reportedByUserId: 5,
			winners: ["BRAVO", "BRAVO", "BRAVO", "BRAVO"],
			weapons: [],
		});

		expect(result.status).toBe("DIFFERENT");
		expect(result.shouldRefreshCaches).toBe(false);
	});

	test("duplicate report returns DUPLICATE status", async () => {
		const alphaGroupId = await createGroup([1, 2, 3, 4]);
		const bravoGroupId = await createGroup([5, 6, 7, 8]);
		const match = await createMatch(alphaGroupId, bravoGroupId);

		await SQMatchRepository.reportScore({
			matchId: match.id,
			reportedByUserId: 1,
			winners: ["ALPHA", "ALPHA", "BRAVO", "ALPHA"],
			weapons: [],
		});

		const result = await SQMatchRepository.reportScore({
			matchId: match.id,
			reportedByUserId: 2,
			winners: ["ALPHA", "ALPHA", "BRAVO", "ALPHA"],
			weapons: [],
		});

		expect(result.status).toBe("DUPLICATE");
		expect(result.shouldRefreshCaches).toBe(false);
	});
});

describe("cancelMatch", () => {
	beforeEach(async () => {
		await dbInsertUsers(8);
	});

	afterEach(() => {
		dbReset();
	});

	test("first cancel report sets group inactive", async () => {
		const alphaGroupId = await createGroup([1, 2, 3, 4]);
		const bravoGroupId = await createGroup([5, 6, 7, 8]);
		const match = await createMatch(alphaGroupId, bravoGroupId);

		const result = await SQMatchRepository.cancelMatch({
			matchId: match.id,
			reportedByUserId: 1,
		});

		expect(result.status).toBe("CANCEL_REPORTED");
		expect(result.shouldRefreshCaches).toBe(false);

		const alphaGroup = await fetchGroup(alphaGroupId);
		expect(alphaGroup?.status).toBe("INACTIVE");
	});

	test("matching cancel confirms and locks match", async () => {
		const alphaGroupId = await createGroup([1, 2, 3, 4]);
		const bravoGroupId = await createGroup([5, 6, 7, 8]);
		const match = await createMatch(alphaGroupId, bravoGroupId);

		await SQMatchRepository.cancelMatch({
			matchId: match.id,
			reportedByUserId: 1,
		});

		const result = await SQMatchRepository.cancelMatch({
			matchId: match.id,
			reportedByUserId: 5,
		});

		expect(result.status).toBe("CANCEL_CONFIRMED");
		expect(result.shouldRefreshCaches).toBe(true);

		const skills = await fetchSkills(match.id);
		expect(skills).toHaveLength(1);
		expect(skills[0].season).toBe(-1);
	});

	test("cant cancel after score reported", async () => {
		const alphaGroupId = await createGroup([1, 2, 3, 4]);
		const bravoGroupId = await createGroup([5, 6, 7, 8]);
		const match = await createMatch(alphaGroupId, bravoGroupId);

		await SQMatchRepository.reportScore({
			matchId: match.id,
			reportedByUserId: 1,
			winners: ["ALPHA", "ALPHA", "BRAVO", "ALPHA"],
			weapons: [],
		});

		const result = await SQMatchRepository.cancelMatch({
			matchId: match.id,
			reportedByUserId: 5,
		});

		expect(result.status).toBe("CANT_CANCEL");
		expect(result.shouldRefreshCaches).toBe(false);
	});
});

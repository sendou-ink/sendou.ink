import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { db } from "~/db/sql";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import * as SQGroupRepository from "../sendouq/SQGroupRepository.server";
import * as SQMatchRepository from "./SQMatchRepository.server";

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

		const alphaGroup = await fetchGroup(alphaGroupId);
		const bravoGroup = await fetchGroup(bravoGroupId);
		expect(alphaGroup?.status).toBe("INACTIVE");
		expect(bravoGroup?.status).toBe("INACTIVE");

		const skills = await fetchSkills(match.id);
		expect(skills).toHaveLength(1);
		expect(skills[0].season).toBe(-1);
	});

	test("cant cancel after score reported", async () => {
		const alphaGroupId = await createGroup([1, 2, 3, 4]);
		const bravoGroupId = await createGroup([5, 6, 7, 8]);
		const match = await createMatch(alphaGroupId, bravoGroupId);

		await SQMatchRepository.reportMapWinner({
			matchId: match.id,
			winnerId: alphaGroupId,
			reportedByUserId: 1,
			reportedCount: 0,
		});

		const result = await SQMatchRepository.cancelMatch({
			matchId: match.id,
			reportedByUserId: 5,
		});

		expect(result.status).toBe("CANT_CANCEL");
		expect(result.shouldRefreshCaches).toBe(false);
	});

	test("admin cancel locks match without applying SP changes", async () => {
		const alphaGroupId = await createGroup([1, 2, 3, 4]);
		const bravoGroupId = await createGroup([5, 6, 7, 8]);
		const match = await createMatch(alphaGroupId, bravoGroupId);

		const adminUserId = 1;
		const result = await SQMatchRepository.cancelMatch({
			matchId: match.id,
			reportedByUserId: adminUserId,
			isAdminReport: true,
		});

		expect(result.status).toBe("CANCEL_CONFIRMED");
		expect(result.shouldRefreshCaches).toBe(true);

		const alphaGroup = await fetchGroup(alphaGroupId);
		const bravoGroup = await fetchGroup(bravoGroupId);
		expect(alphaGroup?.status).toBe("INACTIVE");
		expect(bravoGroup?.status).toBe("INACTIVE");

		const skills = await fetchSkills(match.id);
		const realSkills = skills.filter((s) => s.season !== -1);
		expect(realSkills).toHaveLength(0);
		expect(skills).toHaveLength(1);
		expect(skills[0].season).toBe(-1);

		const maps = await fetchMapResults(match.id);
		for (const map of maps) {
			expect(map.winnerGroupId).toBeNull();
		}
	});
});

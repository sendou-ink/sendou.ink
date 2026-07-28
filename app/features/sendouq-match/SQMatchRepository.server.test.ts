import { beforeEach, describe, expect, test } from "vitest";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import { withUserId } from "~/utils/Test";
import * as SQMatchRepository from "./SQMatchRepository.server";

const setupMatch = async () => {
	const users = await UserFactory.createMany(FULL_GROUP_SIZE * 2);
	const alphaMembers = users.slice(0, FULL_GROUP_SIZE);
	const bravoMembers = users.slice(FULL_GROUP_SIZE);

	const match = await SQMatchFactory.create({
		alphaUserIds: alphaMembers.map((member) => member.id),
		bravoUserIds: bravoMembers.map((member) => member.id),
	});

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
});

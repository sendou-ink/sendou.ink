import { sub } from "date-fns";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("~/features/chat/ChatSystemMessage.server", () => ({
	send: vi.fn(),
	removeRoom: vi.fn(),
	setMetadata: vi.fn(),
}));

import * as GroupMatchContinueVoteFactory from "~/db/seed/factories/GroupMatchContinueVoteFactory";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import { CloseExpiredContinueVotesRoutine } from "./closeExpiredContinueVotes";

let alphaUserIds: number[];
let bravoUserIds: number[];

const setupMatch = async ({
	isMatchmade,
	confirmedAt,
}: {
	isMatchmade: boolean;
	confirmedAt: Date;
}) => {
	const match = await SQMatchFactory.create(
		{ alphaUserIds, bravoUserIds, isMatchmade },
		{ isConcluded: true, confirmedAt },
	);

	return {
		alphaGroupId: match.alphaGroup.id,
		bravoGroupId: match.bravoGroup.id,
	};
};

const castContinueVote = (groupId: number, userId: number) =>
	GroupMatchContinueVoteFactory.create({ userId, groupId });

const fetchVotes = (groupId: number) =>
	db
		.selectFrom("GroupMatchContinueVote")
		.selectAll()
		.where("groupId", "=", groupId)
		.execute();

describe("CloseExpiredContinueVotesRoutine", () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));

		const users = await UserFactory.createMany(FULL_GROUP_SIZE * 2);
		alphaUserIds = users.slice(0, FULL_GROUP_SIZE).map((user) => user.id);
		bravoUserIds = users.slice(FULL_GROUP_SIZE).map((user) => user.id);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("flips all non-NO members to NO for matchmade groups whose match confirmed over 1h ago", async () => {
		const { alphaGroupId, bravoGroupId } = await setupMatch({
			isMatchmade: true,
			confirmedAt: sub(new Date(), { hours: 2 }),
		});
		await castContinueVote(alphaGroupId, alphaUserIds[0]);
		await castContinueVote(alphaGroupId, alphaUserIds[1]);

		await CloseExpiredContinueVotesRoutine.run();

		const alphaVotes = await fetchVotes(alphaGroupId);
		const bravoVotes = await fetchVotes(bravoGroupId);

		expect(alphaVotes).toHaveLength(4);
		expect(alphaVotes.every((v) => v.isContinuing === 0)).toBe(true);
		expect(new Set(alphaVotes.map((v) => v.userId))).toEqual(
			new Set(alphaUserIds),
		);

		expect(bravoVotes).toHaveLength(4);
		expect(bravoVotes.every((v) => v.isContinuing === 0)).toBe(true);
	});

	test("leaves matches confirmed under 1h ago untouched", async () => {
		const { alphaGroupId, bravoGroupId } = await setupMatch({
			isMatchmade: true,
			confirmedAt: sub(new Date(), { minutes: 30 }),
		});
		await castContinueVote(alphaGroupId, alphaUserIds[0]);

		await CloseExpiredContinueVotesRoutine.run();

		const alphaVotes = await fetchVotes(alphaGroupId);
		expect(alphaVotes).toHaveLength(1);
		expect(alphaVotes[0].isContinuing).toBe(1);
		expect(await fetchVotes(bravoGroupId)).toHaveLength(0);
	});

	test("does not touch non-matchmade groups even if match confirmed long ago", async () => {
		const { alphaGroupId, bravoGroupId } = await setupMatch({
			isMatchmade: false,
			confirmedAt: sub(new Date(), { hours: 2 }),
		});

		await CloseExpiredContinueVotesRoutine.run();

		expect(await fetchVotes(alphaGroupId)).toHaveLength(0);
		expect(await fetchVotes(bravoGroupId)).toHaveLength(0);
	});

	test("skips groups whose cascade is fully resolved (every member already has a vote row)", async () => {
		const { alphaGroupId } = await setupMatch({
			isMatchmade: true,
			confirmedAt: sub(new Date(), { hours: 2 }),
		});
		for (const userId of alphaUserIds) {
			await castContinueVote(alphaGroupId, userId);
		}

		await CloseExpiredContinueVotesRoutine.run();

		const alphaVotes = await fetchVotes(alphaGroupId);
		expect(alphaVotes.every((v) => v.isContinuing === 1)).toBe(true);
	});
});

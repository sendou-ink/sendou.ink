import { beforeEach, describe, expect, test } from "vitest";
import type { ScannerMatch } from "../core/scanner-match";
import {
	type CompactedMatch,
	compactSessions,
	deleteCompactedSessions,
	listCompactedMatches,
	updateCompactedMatchesSend,
} from "./compacted-matches";
import { deleteEvents, listEvents, saveEvent } from "./events";

const MATCH = { mode: "SZ", stage: 0 } as ScannerMatch;

function compacted(
	id: number,
	sessionKey: number,
	index: number,
): CompactedMatch {
	return {
		id,
		session: { key: sessionKey, endedAt: sessionKey + 1_000, originT: 0 },
		index,
		match: MATCH,
		sources: [
			{
				id,
				type: "MapStart",
				t: 0,
				detectedAt: sessionKey,
				confidence: 1,
				data: null,
			},
			{
				id: id + 1,
				type: "Death",
				t: 1,
				detectedAt: sessionKey,
				confidence: 1,
				data: null,
			},
		],
	};
}

async function clearAll() {
	const matches = await listCompactedMatches();
	await deleteCompactedSessions(matches.map((match) => match.session.key));
	await deleteEvents((await listEvents()).map((event) => event.id!));
}

describe("compactSessions()", () => {
	beforeEach(clearAll);

	test("stores the games and deletes the raw events they replace", async () => {
		const id = await saveEvent({
			type: "Objective",
			t: 0,
			confidence: 1,
			data: null,
		});

		await compactSessions([compacted(10, 1_000, 0)], [id]);

		expect(await listEvents()).toEqual([]);
		expect((await listCompactedMatches()).map((match) => match.id)).toEqual([
			10,
		]);
	});
});

describe("listCompactedMatches()", () => {
	beforeEach(clearAll);

	test("lists the sessions keyed from `since` on, each session's games in order", async () => {
		await compactSessions(
			[
				compacted(30, 2_000, 1),
				compacted(10, 1_000, 0),
				compacted(20, 2_000, 0),
			],
			[],
		);

		expect((await listCompactedMatches()).map((match) => match.id)).toEqual([
			10, 20, 30,
		]);
		expect(
			(await listCompactedMatches(2_000)).map((match) => match.id),
		).toEqual([20, 30]);
	});
});

describe("updateCompactedMatchesSend()", () => {
	beforeEach(clearAll);

	test("sets the status on every kept source of the given games", async () => {
		await compactSessions(
			[compacted(10, 1_000, 0), compacted(20, 1_000, 1)],
			[],
		);

		await updateCompactedMatchesSend([10], { state: "sent", at: 5 });

		const [first, second] = await listCompactedMatches();
		expect(first!.sources.map((source) => source.send?.state)).toEqual([
			"sent",
			"sent",
		]);
		expect(second!.sources.map((source) => source.send)).toEqual([
			undefined,
			undefined,
		]);
	});
});

describe("deleteCompactedSessions()", () => {
	beforeEach(clearAll);

	test("deletes every game of the given sessions only", async () => {
		await compactSessions(
			[
				compacted(10, 1_000, 0),
				compacted(20, 1_000, 1),
				compacted(30, 2_000, 0),
			],
			[],
		);

		await deleteCompactedSessions([1_000]);

		expect((await listCompactedMatches()).map((match) => match.id)).toEqual([
			30,
		]);
	});
});

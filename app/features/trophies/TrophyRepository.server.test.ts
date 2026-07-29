import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { db } from "~/db/sql";
import type { TournamentTierNumber } from "~/features/tournament/core/tiering";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import * as TrophyRepository from "./TrophyRepository.server";

describe("trophy approvals", () => {
	let pendingTrophyId: number;

	beforeEach(async () => {
		await dbInsertUsers(4);
		await db
			.insertInto("TournamentOrganization")
			.values({ name: "Test Org", slug: "test-org" })
			.execute();

		const pending = await TrophyRepository.createPending({
			name: "Test Trophy",
			model: "model",
			description: "",
			organizationId: 1,
			submitterUserId: 1,
		});
		pendingTrophyId = pending.id;
	});

	afterEach(() => {
		dbReset();
	});

	test("creates the trophy exactly once when approvals exceed the required count", async () => {
		expect(
			await TrophyRepository.addApproval({ pendingTrophyId, userId: 2 }),
		).toBe(null);

		const accepted = await TrophyRepository.addApproval({
			pendingTrophyId,
			userId: 3,
		});
		expect(accepted?.id).toBeTypeOf("number");

		expect(
			await TrophyRepository.addApproval({ pendingTrophyId, userId: 4 }),
		).toBe(null);

		expect(await trophyCount()).toBe(1);
	});

	test("ignores repeated approvals from the same user", async () => {
		await TrophyRepository.addApproval({ pendingTrophyId, userId: 2 });

		expect(
			await TrophyRepository.addApproval({ pendingTrophyId, userId: 2 }),
		).toBe(null);

		const pending = await TrophyRepository.findPendingById(pendingTrophyId);
		expect(pending?.approvals.length).toBe(1);
		expect(await trophyCount()).toBe(0);
	});

	test("re-approval after acceptance does not create another trophy", async () => {
		await TrophyRepository.addApproval({ pendingTrophyId, userId: 2 });
		await TrophyRepository.addApproval({ pendingTrophyId, userId: 3 });

		expect(
			await TrophyRepository.addApproval({ pendingTrophyId, userId: 2 }),
		).toBe(null);

		expect(await trophyCount()).toBe(1);
	});

	test("declines a pending trophy that is not accepted", async () => {
		await TrophyRepository.addApproval({ pendingTrophyId, userId: 2 });

		expect(
			await TrophyRepository.declinePending({
				id: pendingTrophyId,
				reason: "reason",
				declinedByUserId: 3,
			}),
		).toBe(true);

		const pending = await TrophyRepository.findPendingById(pendingTrophyId);
		expect(pending?.declinedAt).not.toBe(null);
		expect(pending?.approvals.length).toBe(0);
	});

	test("does not decline an already accepted pending trophy", async () => {
		await TrophyRepository.addApproval({ pendingTrophyId, userId: 2 });
		await TrophyRepository.addApproval({ pendingTrophyId, userId: 3 });

		expect(
			await TrophyRepository.declinePending({
				id: pendingTrophyId,
				reason: "reason",
				declinedByUserId: 4,
			}),
		).toBe(false);

		const pending = await TrophyRepository.findPendingById(pendingTrophyId);
		expect(pending?.declinedAt).toBe(null);
		expect(await trophyCount()).toBe(1);
	});

	test("approvals after a decline do not create a trophy", async () => {
		await TrophyRepository.declinePending({
			id: pendingTrophyId,
			reason: "reason",
			declinedByUserId: 2,
		});

		await TrophyRepository.addApproval({ pendingTrophyId, userId: 2 });
		expect(
			await TrophyRepository.addApproval({ pendingTrophyId, userId: 3 }),
		).toBe(null);

		expect(await trophyCount()).toBe(0);
	});
});

describe("trophy list tiers", () => {
	let trophyId: number;

	beforeEach(async () => {
		await dbInsertUsers(2);

		const trophy = await db
			.insertInto("Trophy")
			.values({
				name: "Tiered Trophy",
				model: "model",
				creatorId: 1,
				managerId: 1,
			})
			.returning("id")
			.executeTakeFirstOrThrow();
		trophyId = trophy.id;
	});

	afterEach(() => {
		dbReset();
	});

	test("an upcoming tournament without tier info does not hide the earned tier", async () => {
		await insertTrophyTournament({ trophyId, tier: 3, startInDays: -21 });
		await insertTrophyTournament({ trophyId, tier: null, startInDays: 10 });

		const trophy = (await TrophyRepository.all()).find(
			(row) => row.name === "Tiered Trophy",
		);

		expect(trophy?.tier).toBe(3);
	});

	test("uses the most recent tier when multiple tournaments have one", async () => {
		await insertTrophyTournament({ trophyId, tier: 5, startInDays: -30 });
		await insertTrophyTournament({ trophyId, tier: 3, startInDays: -7 });

		const trophy = (await TrophyRepository.all()).find(
			(row) => row.name === "Tiered Trophy",
		);

		expect(trophy?.tier).toBe(3);
	});

	test("has no tier when no linked tournament has tier info", async () => {
		await insertTrophyTournament({ trophyId, tier: null, startInDays: 10 });

		const trophy = (await TrophyRepository.all()).find(
			(row) => row.name === "Tiered Trophy",
		);

		expect(trophy?.tier).toBe(null);
		expect(trophy?.tentativeTier).toBe(null);
	});

	test("returns the start time of the next upcoming tournament", async () => {
		await insertTrophyTournament({ trophyId, tier: 3, startInDays: -21 });
		await insertTrophyTournament({ trophyId, tier: null, startInDays: 20 });
		await insertTrophyTournament({ trophyId, tier: null, startInDays: 10 });

		const trophy = (await TrophyRepository.all()).find(
			(row) => row.name === "Tiered Trophy",
		);

		const expected = dateToDatabaseTimestamp(
			new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
		);
		expect(
			Math.abs((trophy?.upcomingTournamentAt ?? 0) - expected),
		).toBeLessThan(10);
	});

	test("sorts trophies with an upcoming tournament first within the same tier", async () => {
		await insertTrophyTournament({ trophyId, tier: 3, startInDays: -21 });

		const upcoming = await db
			.insertInto("Trophy")
			.values({
				name: "Upcoming Trophy",
				model: "model",
				creatorId: 1,
				managerId: 1,
			})
			.returning("id")
			.executeTakeFirstOrThrow();
		await insertTrophyTournament({
			trophyId: upcoming.id,
			tier: 3,
			startInDays: -14,
		});
		await insertTrophyTournament({
			trophyId: upcoming.id,
			tier: null,
			startInDays: 10,
		});

		const distant = await db
			.insertInto("Trophy")
			.values({
				name: "Distant Trophy",
				model: "model",
				creatorId: 1,
				managerId: 1,
			})
			.returning("id")
			.executeTakeFirstOrThrow();
		await insertTrophyTournament({
			trophyId: distant.id,
			tier: 3,
			startInDays: -7,
		});
		await insertTrophyTournament({
			trophyId: distant.id,
			tier: null,
			startInDays: 5 * 7,
		});

		const names = (await TrophyRepository.all()).map((row) => row.name);

		expect(names).toEqual([
			"Upcoming Trophy",
			"Tiered Trophy",
			"Distant Trophy",
		]);
	});
});

async function trophyCount() {
	const { count } = await db
		.selectFrom("Trophy")
		.select((eb) => eb.fn.countAll<number>().as("count"))
		.executeTakeFirstOrThrow();

	return count;
}

async function insertTrophyTournament({
	trophyId,
	tier,
	startInDays,
}: {
	trophyId: number;
	tier: TournamentTierNumber | null;
	startInDays: number;
}) {
	const tournament = await db
		.insertInto("Tournament")
		.values({
			mapPickingStyle: "AUTO_ALL",
			settings: JSON.stringify({ bracketProgression: [] }),
			tier,
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	const event = await db
		.insertInto("CalendarEvent")
		.values({
			name: `Tournament ${tournament.id}`,
			bracketUrl: "https://example.com",
			authorId: 1,
			tournamentId: tournament.id,
			trophyId,
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	await db
		.insertInto("CalendarEventDate")
		.values({
			eventId: event.id,
			startTime: dateToDatabaseTimestamp(
				new Date(Date.now() + startInDays * 24 * 60 * 60 * 1000),
			),
		})
		.execute();
}

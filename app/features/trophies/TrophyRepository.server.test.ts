import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { db } from "~/db/sql";
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

async function trophyCount() {
	const { count } = await db
		.selectFrom("Trophy")
		.select((eb) => eb.fn.countAll<number>().as("count"))
		.executeTakeFirstOrThrow();

	return count;
}

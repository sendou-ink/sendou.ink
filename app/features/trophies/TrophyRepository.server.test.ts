import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as TrophyFactory from "~/db/seed/factories/TrophyFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import type { TournamentTierNumber } from "~/features/tournament/core/tiering";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as TrophyRepository from "./TrophyRepository.server";
import { TROPHY_APPROVALS_REQUIRED } from "./trophies-constants";

describe("trophy approvals", () => {
	let pendingTrophyId: number;
	let reviewerIds: number[];

	beforeEach(async () => {
		const submitter = await UserFactory.create();
		reviewerIds = (
			await UserFactory.createMany(TROPHY_APPROVALS_REQUIRED + 1)
		).map((user) => user.id);
		const organization = await TournamentOrganizationFactory.create({
			ownerId: submitter.id,
		});

		const pending = await TrophyFactory.createPending({
			organizationId: organization.id,
			submitterUserId: submitter.id,
		});
		pendingTrophyId = pending.id;
	});

	test("creates the trophy exactly once when approvals exceed the required count", async () => {
		for (const userId of reviewerIds.slice(0, TROPHY_APPROVALS_REQUIRED - 1)) {
			expect(
				await TrophyRepository.addApproval({ pendingTrophyId, userId }),
			).toBe(null);
		}

		const accepted = await TrophyRepository.addApproval({
			pendingTrophyId,
			userId: reviewerIds[TROPHY_APPROVALS_REQUIRED - 1],
		});
		expect(accepted?.id).toBeTypeOf("number");

		expect(
			await TrophyRepository.addApproval({
				pendingTrophyId,
				userId: reviewerIds[TROPHY_APPROVALS_REQUIRED],
			}),
		).toBe(null);

		expect(await trophyCount()).toBe(1);
	});

	test("ignores repeated approvals from the same user", async () => {
		await TrophyRepository.addApproval({
			pendingTrophyId,
			userId: reviewerIds[0],
		});

		expect(
			await TrophyRepository.addApproval({
				pendingTrophyId,
				userId: reviewerIds[0],
			}),
		).toBe(null);

		const pending = await TrophyRepository.findPendingById(pendingTrophyId);
		expect(pending?.approvals.length).toBe(1);
		expect(await trophyCount()).toBe(0);
	});

	test("re-approval after acceptance does not create another trophy", async () => {
		for (const userId of reviewerIds.slice(0, TROPHY_APPROVALS_REQUIRED)) {
			await TrophyRepository.addApproval({ pendingTrophyId, userId });
		}

		expect(
			await TrophyRepository.addApproval({
				pendingTrophyId,
				userId: reviewerIds[0],
			}),
		).toBe(null);

		expect(await trophyCount()).toBe(1);
	});

	test("declines a pending trophy that is not accepted", async () => {
		await TrophyRepository.addApproval({
			pendingTrophyId,
			userId: reviewerIds[0],
		});

		expect(
			await TrophyRepository.declinePending({
				id: pendingTrophyId,
				reason: "reason",
				declinedByUserId: reviewerIds[1],
			}),
		).toBe(true);

		const pending = await TrophyRepository.findPendingById(pendingTrophyId);
		expect(pending?.declinedAt).not.toBe(null);
		expect(pending?.approvals.length).toBe(0);
	});

	test("does not decline an already accepted pending trophy", async () => {
		for (const userId of reviewerIds.slice(0, TROPHY_APPROVALS_REQUIRED)) {
			await TrophyRepository.addApproval({ pendingTrophyId, userId });
		}

		expect(
			await TrophyRepository.declinePending({
				id: pendingTrophyId,
				reason: "reason",
				declinedByUserId: reviewerIds[TROPHY_APPROVALS_REQUIRED],
			}),
		).toBe(false);

		const pending = await TrophyRepository.findPendingById(pendingTrophyId);
		expect(pending?.declinedAt).toBe(null);
		expect(await trophyCount()).toBe(1);
	});

	test("stays accepted even if approvals drop below the required count", async () => {
		for (const userId of reviewerIds.slice(0, TROPHY_APPROVALS_REQUIRED)) {
			await TrophyRepository.addApproval({ pendingTrophyId, userId });
		}

		// biome-ignore lint/plugin: simulates raising TROPHY_APPROVALS_REQUIRED after acceptance, which no production code path can do
		await db
			.deleteFrom("PendingTrophyApproval")
			.where("pendingTrophyId", "=", pendingTrophyId)
			.where("userId", "=", reviewerIds[0])
			.execute();

		expect(
			await TrophyRepository.addApproval({
				pendingTrophyId,
				userId: reviewerIds[TROPHY_APPROVALS_REQUIRED],
			}),
		).toBe(null);

		expect(
			await TrophyRepository.declinePending({
				id: pendingTrophyId,
				reason: "reason",
				declinedByUserId: reviewerIds[TROPHY_APPROVALS_REQUIRED],
			}),
		).toBe(false);

		expect(await trophyCount()).toBe(1);
	});

	test("approvals after a decline do not create a trophy", async () => {
		await TrophyRepository.declinePending({
			id: pendingTrophyId,
			reason: "reason",
			declinedByUserId: reviewerIds[0],
		});

		for (const userId of reviewerIds.slice(0, TROPHY_APPROVALS_REQUIRED)) {
			expect(
				await TrophyRepository.addApproval({ pendingTrophyId, userId }),
			).toBe(null);
		}

		expect(await trophyCount()).toBe(0);
	});
});

describe("trophy list tiers", () => {
	let authorId: number;
	let trophyId: number;

	beforeEach(async () => {
		const author = await UserFactory.create();
		authorId = author.id;

		const trophy = await TrophyFactory.create({ name: "Tiered Trophy" });
		trophyId = trophy.id;
	});

	test("an upcoming tournament without tier info does not hide the earned tier", async () => {
		await createTrophyTournament({ trophyId, tier: 3, startInDays: -21 });
		await createTrophyTournament({ trophyId, tier: null, startInDays: 10 });

		expect(await findTrophyByName("Tiered Trophy")).toMatchObject({ tier: 3 });
	});

	test("uses the most recent tier when multiple tournaments have one", async () => {
		await createTrophyTournament({ trophyId, tier: 5, startInDays: -30 });
		await createTrophyTournament({ trophyId, tier: 3, startInDays: -7 });

		expect(await findTrophyByName("Tiered Trophy")).toMatchObject({ tier: 3 });
	});

	test("has no tier when no linked tournament has tier info", async () => {
		await createTrophyTournament({ trophyId, tier: null, startInDays: 10 });

		expect(await findTrophyByName("Tiered Trophy")).toMatchObject({
			tier: null,
			tentativeTier: null,
		});
	});

	test("returns the start time of the next upcoming tournament", async () => {
		await createTrophyTournament({ trophyId, tier: 3, startInDays: -21 });
		await createTrophyTournament({ trophyId, tier: null, startInDays: 20 });
		await createTrophyTournament({ trophyId, tier: null, startInDays: 10 });

		const trophy = await findTrophyByName("Tiered Trophy");

		const expected = dateToDatabaseTimestamp(daysFromNow(10));
		expect(
			Math.abs((trophy?.upcomingTournamentAt ?? 0) - expected),
		).toBeLessThan(10);
	});

	test("sorts trophies with an upcoming tournament first within the same tier", async () => {
		await createTrophyTournament({ trophyId, tier: 3, startInDays: -21 });

		const upcoming = await TrophyFactory.create({ name: "Upcoming Trophy" });
		await createTrophyTournament({
			trophyId: upcoming.id,
			tier: 3,
			startInDays: -14,
		});
		await createTrophyTournament({
			trophyId: upcoming.id,
			tier: null,
			startInDays: 10,
		});

		const distant = await TrophyFactory.create({ name: "Distant Trophy" });
		await createTrophyTournament({
			trophyId: distant.id,
			tier: 3,
			startInDays: -7,
		});
		await createTrophyTournament({
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

	function createTrophyTournament({
		trophyId,
		tier,
		startInDays,
	}: {
		trophyId: number;
		tier: TournamentTierNumber | null;
		startInDays: number;
	}) {
		return TournamentFactory.create(
			{
				authorId,
				startTimes: [dateToDatabaseTimestamp(daysFromNow(startInDays))],
				trophyId,
			},
			tier ? { tier } : undefined,
		);
	}
});

describe("existsByName", () => {
	let ownerId: number;
	let approverIds: number[];
	let organizationId: number;

	beforeEach(async () => {
		const owner = await UserFactory.create();
		ownerId = owner.id;
		approverIds = (await UserFactory.createMany(TROPHY_APPROVALS_REQUIRED)).map(
			(user) => user.id,
		);
		organizationId = (await TournamentOrganizationFactory.create({ ownerId }))
			.id;
	});

	test("updating a trophy keeping its name does not collide with its accepted submission", async () => {
		await TrophyFactory.createPending(
			{ name: "Winner's Cup", organizationId, submitterUserId: ownerId },
			{ approverUserIds: approverIds },
		);

		const trophy = await db
			.selectFrom("Trophy")
			.select("id")
			.where("name", "=", "Winner's Cup")
			.executeTakeFirstOrThrow();

		expect(
			await TrophyRepository.existsByName({
				name: "Winner's Cup",
				excludeTrophyId: trophy.id,
			}),
		).toBe(false);
	});

	test("an existing trophy's name still blocks new submissions", async () => {
		await TrophyFactory.create({ name: "Winner's Cup" });

		expect(await TrophyRepository.existsByName({ name: "Winner's Cup" })).toBe(
			true,
		);
	});

	test("a submission awaiting review blocks the name", async () => {
		await TrophyFactory.createPending({
			name: "Contested Cup",
			organizationId,
			submitterUserId: ownerId,
		});

		expect(await TrophyRepository.existsByName({ name: "Contested Cup" })).toBe(
			true,
		);
	});

	test("a declined submission does not block the name", async () => {
		await TrophyFactory.createPending(
			{ name: "Declined Cup", organizationId, submitterUserId: ownerId },
			{ declinedBy: { userId: approverIds[0], reason: "reason" } },
		);

		expect(await TrophyRepository.existsByName({ name: "Declined Cup" })).toBe(
			false,
		);
	});
});

describe("user deletion", () => {
	test("keeps their trophies and drops their approvals", async () => {
		const submitter = await UserFactory.create();
		const deleted = await UserFactory.create();

		const trophy = await TrophyFactory.create({
			name: "Orphaned Trophy",
			creatorId: deleted.id,
			managerId: deleted.id,
		});

		const organization = await TournamentOrganizationFactory.create({
			ownerId: submitter.id,
		});
		await TrophyFactory.createPending(
			{
				organizationId: organization.id,
				submitterUserId: submitter.id,
			},
			{ approverUserIds: [deleted.id] },
		);

		// biome-ignore lint/plugin: no production code path deletes users, the test pins the schemas on-delete behavior
		await db.deleteFrom("User").where("id", "=", deleted.id).execute();

		const orphaned = await db
			.selectFrom("Trophy")
			.select(["creatorId", "managerId"])
			.where("id", "=", trophy.id)
			.executeTakeFirstOrThrow();
		expect(orphaned).toEqual({ creatorId: null, managerId: null });

		expect(
			await db.selectFrom("PendingTrophyApproval").selectAll().execute(),
		).toEqual([]);
	});
});

async function findTrophyByName(name: string) {
	return (await TrophyRepository.all()).find((row) => row.name === name);
}

async function trophyCount() {
	const { count } = await db
		.selectFrom("Trophy")
		.select((eb) => eb.fn.countAll<number>().as("count"))
		.executeTakeFirstOrThrow();

	return count;
}

const daysFromNow = (days: number) =>
	new Date(Date.now() + days * 24 * 60 * 60 * 1000);

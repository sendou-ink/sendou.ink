import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import type { SerializeFrom } from "~/utils/remix";
import { dbInsertUsers, dbReset, wrappedLoader } from "~/utils/Test";
import { loader } from "../loaders/org.$slug.stats.server";
import * as TournamentOrganizationRepository from "../TournamentOrganizationRepository.server";
import { seedOrgEventWithParticipants } from "../test-utils";
import { ESTABLISHED_ORG } from "../tournament-organization-constants";

const statsLoader = wrappedLoader<SerializeFrom<typeof loader>>({ loader });

const createOrg = () =>
	TournamentOrganizationRepository.create({ ownerId: 1, name: "Org" });

describe("org stats loader", () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 0, 15));
		await dbInsertUsers(5);
	});

	afterEach(() => {
		vi.useRealTimers();
		dbReset();
	});

	test("throws when the user is not an org admin", async () => {
		const org = await createOrg();

		await expect(
			statsLoader({ user: "regular", params: { slug: org.slug } }),
		).rejects.toThrow();
	});

	test("allows an org admin", async () => {
		const org = await createOrg();

		const data = await statsLoader({
			user: "admin",
			params: { slug: org.slug },
		});

		expect(data.monthlyStats).toHaveLength(ESTABLISHED_ORG.MONTHS_CONSIDERED);
	});

	test("returns finished months most recent first, excluding the current month", async () => {
		const org = await createOrg();

		const data = await statsLoader({
			user: "admin",
			params: { slug: org.slug },
		});

		// system time is Jan 2026 -> most recent finished month is Dec 2025,
		// and the current (ongoing) month is not included
		expect(data.monthlyStats.map((m) => m.month)).toEqual([
			"2025-12",
			"2025-11",
			"2025-10",
			"2025-09",
			"2025-08",
			"2025-07",
		]);
	});

	test("counts participants per month and averages over the considered months", async () => {
		const org = await createOrg();

		// 3 participants in December 2025 (a finished month)
		await seedOrgEventWithParticipants({
			organizationId: org.id,
			startTime: dateToDatabaseTimestamp(new Date(2025, 11, 10)),
			participantUserIds: [1, 2, 3],
		});
		// an event in the current month is ignored
		await seedOrgEventWithParticipants({
			organizationId: org.id,
			startTime: dateToDatabaseTimestamp(new Date(2026, 0, 5)),
			participantUserIds: [1, 2, 3, 4, 5],
		});

		const data = await statsLoader({
			user: "admin",
			params: { slug: org.slug },
		});

		expect(data.monthlyStats[0]).toEqual({ month: "2025-12", count: 3 });
		expect(data.averageMonthlyParticipants).toBeCloseTo(
			3 / ESTABLISHED_ORG.MONTHS_CONSIDERED,
		);
	});
});

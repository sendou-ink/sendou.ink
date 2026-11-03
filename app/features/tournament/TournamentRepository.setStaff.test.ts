import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import * as TournamentRepository from "./TournamentRepository.server";

const users = UserFactory.pool();

const authorId = () => users.id(1);
const originalStafferId = () => users.id(2);
const addedStafferId = () => users.id(3);

const staffCreatedAtOf = async (tournamentId: number) => {
	const rows = await db
		.selectFrom("TournamentStaff")
		.select(["TournamentStaff.userId", "TournamentStaff.createdAt"])
		.where("TournamentStaff.tournamentId", "=", tournamentId)
		.execute();

	return new Map(rows.map((row) => [row.userId, row.createdAt]));
};

describe("TournamentRepository.setStaff", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("keeps when existing staff were added and stamps the newly added ones", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-08-01T12:00:00Z"));

		const tournament = await TournamentFactory.create({
			authorId: authorId(),
		});
		await TournamentRepository.setStaff({
			tournamentId: tournament.id,
			staff: [{ userId: originalStafferId(), role: "ORGANIZER" }],
		});
		const before = await staffCreatedAtOf(tournament.id);

		vi.setSystemTime(new Date("2026-08-02T12:00:00Z"));

		await TournamentRepository.setStaff({
			tournamentId: tournament.id,
			staff: [
				{ userId: originalStafferId(), role: "STREAMER" },
				{ userId: addedStafferId(), role: "ORGANIZER" },
			],
		});
		const after = await staffCreatedAtOf(tournament.id);

		expect(after.get(originalStafferId())).toBe(
			before.get(originalStafferId()),
		);
		expect(after.get(addedStafferId())).toBeGreaterThan(
			before.get(originalStafferId())!,
		);
	});
});

import { sub } from "date-fns";
import { beforeEach, describe, expect, test, vi } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { withUserId } from "~/utils/Test";
import * as ScrimPickupRosterRepository from "./ScrimPickupRosterRepository.server";
import { SCRIM } from "./scrims-constants";

const users = UserFactory.pool();

const OWNER_POSITION = 1;

const upsert = (memberPositions: number[], ownerPosition = OWNER_POSITION) =>
	withUserId(users.id(ownerPosition), () =>
		ScrimPickupRosterRepository.upsertOwn(
			memberPositions.map((position) => users.id(position)),
		),
	);

const findAllRecent = (ownerPosition = OWNER_POSITION) =>
	withUserId(users.id(ownerPosition), () =>
		ScrimPickupRosterRepository.findAllOwnRecent(),
	);

describe("ScrimPickupRosterRepository", () => {
	beforeEach(async () => {
		await users.create(12);
	});

	test("returns the roster members ordered by id", async () => {
		await upsert([4, 2, 3]);

		const rosters = await findAllRecent();

		expect(rosters).toHaveLength(1);
		expect(rosters[0].users.map((user) => user.id)).toEqual([
			users.id(2),
			users.id(3),
			users.id(4),
		]);
	});

	test("does not save the roster of another user", async () => {
		await upsert([2, 3, 4]);

		expect(await findAllRecent(5)).toHaveLength(0);
	});

	test("reuses the roster when the same members are used again", async () => {
		await upsert([2, 3, 4]);
		const [firstRoster] = await findAllRecent();

		await upsert([4, 3, 2]);

		const rosters = await findAllRecent();

		expect(rosters).toHaveLength(1);
		expect(rosters[0].id).toBe(firstRoster.id);
	});

	test("returns the rosters newest first, reuse counting as new", async () => {
		const now = new Date();
		vi.useFakeTimers();

		vi.setSystemTime(sub(now, { days: 3 }));
		await upsert([2, 3, 4]);
		const [firstUsedRoster] = await findAllRecent();

		vi.setSystemTime(sub(now, { days: 2 }));
		await upsert([2, 3, 5]);

		vi.setSystemTime(now);
		await upsert([2, 3, 4]);

		const rosters = await findAllRecent();

		expect(rosters[0].id).toBe(firstUsedRoster.id);

		vi.useRealTimers();
	});

	test("keeps only the newest rosters", async () => {
		const memberPositionsOfExtraRoster = [2, 3, 12];

		for (let i = 0; i < SCRIM.MAX_SAVED_PICKUP_ROSTERS; i++) {
			await upsert([2, 3, 4 + i]);
		}
		await upsert(memberPositionsOfExtraRoster);

		const rosters = await findAllRecent();

		expect(rosters).toHaveLength(SCRIM.MAX_SAVED_PICKUP_ROSTERS);
		expect(rosters[0].users.map((user) => user.id)).toEqual(
			memberPositionsOfExtraRoster.map((position) => users.id(position)),
		);
	});

	test("deletes expired rosters only", async () => {
		const now = new Date();
		vi.useFakeTimers();
		vi.setSystemTime(
			sub(now, {
				months: SCRIM.PICKUP_ROSTER_EXPIRES_IN_MONTHS,
				days: 1,
			}),
		);
		await upsert([2, 3, 4]);
		vi.useRealTimers();

		await upsert([2, 3, 5]);

		const { numDeletedRows } = await ScrimPickupRosterRepository.deleteOld();

		expect(numDeletedRows).toBe(1n);
		expect(await findAllRecent()).toHaveLength(1);
	});
});

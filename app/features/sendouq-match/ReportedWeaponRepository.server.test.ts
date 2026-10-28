import { beforeEach, describe, expect, test, vi } from "vitest";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as SQReportedWeaponFactory from "~/db/seed/factories/SQReportedWeaponFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as Seasons from "~/features/mmr/core/Seasons";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { invariant } from "~/utils/invariant";
import * as ReportedWeaponRepository from "./ReportedWeaponRepository.server";
import * as SQMatchRepository from "./SQMatchRepository.server";

vi.mock("~/features/chat/ChatSystemMessage.server", () => ({
	send: vi.fn(),
	notifyStatusChanged: vi.fn(),
	notifyNotificationsChanged: vi.fn(),
	notifyRoomsChangedByRoomIds: vi.fn(),
}));

const SEASON = Seasons.currentOrPrevious()!.nth;
const WEAPON_SPL_ID = 40;

const users = UserFactory.pool();
const playerId = () => users.id(1);
const enemyId = () => users.id(FULL_GROUP_SIZE + 1);

describe("ReportedWeaponRepository.findAllWeaponUsageStats", () => {
	beforeEach(async () => {
		await users.create(FULL_GROUP_SIZE * 2);
	});

	test("counts a won map of a match in progress", async () => {
		const { map } = await playFirstMapWithWeapon();

		expect(await usageStatsOn(map)).toEqual([
			expect.objectContaining({
				type: "SELF",
				weaponSplId: WEAPON_SPL_ID,
				count: 1,
				wins: 1,
				losses: 0,
			}),
		]);
	});

	test("ignores maps of a match both teams agreed to cancel", async () => {
		const { matchId, map } = await playFirstMapWithWeapon();

		await SQMatchRepository.requestCancelMatch({
			matchId,
			requestedByUserId: playerId(),
			reason: "Disconnect",
			nominatedUserIds: [],
		});
		const acceptance = await SQMatchRepository.acceptCancelMatch({
			matchId,
			acceptedByUserId: enemyId(),
			reason: "Disconnect",
			nominatedUserIds: [],
		});
		expect(acceptance.status).toBe("ACCEPTED");

		expect(await usageStatsOn(map)).toEqual([]);
	});
});

async function playFirstMapWithWeapon() {
	const match = await SQMatchFactory.create({
		alphaUserIds: users.ids().slice(0, FULL_GROUP_SIZE),
		bravoUserIds: users.ids().slice(FULL_GROUP_SIZE),
	});

	const report = await SQMatchRepository.reportMapWinner({
		matchId: match.id,
		winnerId: match.alphaGroup.id,
		reportedByUserId: playerId(),
		reportedCount: 0,
	});
	expect(report.status).toBe("MAP_REPORTED");

	await SQReportedWeaponFactory.createMany(1, () => ({
		groupMatchId: match.id,
		mapIndex: 0,
		userId: playerId(),
		weaponSplId: WEAPON_SPL_ID,
	}));

	const fetched = await SQMatchRepository.findById(match.id);
	invariant(fetched, "Match not found");

	return { matchId: match.id, map: fetched.mapList[0] };
}

function usageStatsOn(map: { mode: ModeShort; stageId: StageId }) {
	return ReportedWeaponRepository.findAllWeaponUsageStats({
		userId: playerId(),
		mode: map.mode,
		stageId: map.stageId,
		season: SEASON,
	});
}

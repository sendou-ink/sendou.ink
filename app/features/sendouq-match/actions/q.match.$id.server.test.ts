import { beforeEach, describe, expect, test, vi } from "vitest";
import type { reportWeaponSchema } from "~/components/match-page/match-page-schemas";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import { assertResponseErrored, wrappedAction } from "~/utils/Test";
import * as ReportedWeaponRepository from "../ReportedWeaponRepository.server";
import * as SQMatchRepository from "../SQMatchRepository.server";
import { action as rawMatchAction } from "./q.match.$id.server";

vi.mock("~/features/chat/ChatSystemMessage.server", () => ({
	send: vi.fn(),
	notifyStatusChanged: vi.fn(),
	notifyNotificationsChanged: vi.fn(),
	notifyRoomsChangedByRoomIds: vi.fn(),
}));

const WEAPON_SPL_ID = 40;

const matchAction = wrappedAction<typeof reportWeaponSchema>({
	action: rawMatchAction,
});

const users = UserFactory.pool();
const playerId = () => users.id(1);
const enemyId = () => users.id(FULL_GROUP_SIZE + 1);

describe("REPORT_WEAPON", () => {
	let matchId: number;

	beforeEach(async () => {
		await users.create(FULL_GROUP_SIZE * 2);

		const match = await SQMatchFactory.create({
			alphaUserIds: users.ids().slice(0, FULL_GROUP_SIZE),
			bravoUserIds: users.ids().slice(FULL_GROUP_SIZE),
		});
		matchId = match.id;
	});

	const reportWeapon = () =>
		matchAction(
			{ _action: "REPORT_WEAPON", mapIndex: 0, weaponSplId: WEAPON_SPL_ID },
			{ user: playerId(), params: { id: String(matchId) } },
		);

	test("saves the weapon of a match in progress", async () => {
		await reportWeapon();

		expect(await ReportedWeaponRepository.findByMatchId(matchId)).toEqual([
			expect.objectContaining({
				mapIndex: 0,
				userId: playerId(),
				weaponSplId: WEAPON_SPL_ID,
			}),
		]);
	});

	test("refuses a weapon report for a canceled match", async () => {
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

		assertResponseErrored(await reportWeapon(), "Match was canceled");
		expect(await ReportedWeaponRepository.findByMatchId(matchId)).toBeNull();
	});
});

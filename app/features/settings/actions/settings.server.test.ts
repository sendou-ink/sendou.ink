import { beforeEach, describe, expect, test, vi } from "vitest";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as MatchProfileRepository from "~/features/match-profile/MatchProfileRepository.server";
import {
	refreshSendouQInstance,
	SendouQ,
} from "~/features/sendouq/core/SendouQ.server";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { wrappedAction } from "~/utils/Test";
import type { settingsActionSchema } from "../settings-schemas.server";
import { action } from "./settings.server";

vi.mock("~/features/chat/ChatSystemMessage.server", () => ({
	send: vi.fn(),
	notifyStatusChanged: vi.fn(),
	notifyNotificationsChanged: vi.fn(),
}));

const OLD_WEAPON_ID: MainWeaponId = 0;
const NEW_WEAPON_ID: MainWeaponId = 40;

const settingsAction = wrappedAction<typeof settingsActionSchema>({
	action,
	isJsonSubmission: true,
});

const users = UserFactory.pool();

const actorId = () => users.id(1);

const updateWeaponPool = (weaponId: MainWeaponId) =>
	settingsAction(
		{
			_action: "UPDATE_MATCH_PROFILE",
			mapModePreferences: { modes: [], pool: [] },
			weaponPool: [{ id: weaponId, isFavorite: false }],
			vc: "NO",
			languages: [],
			noScreen: false,
		},
		{ user: actorId() },
	);

const ownWeaponsInQueue = () =>
	SendouQ.findOwnGroup(actorId())
		?.members.find((member) => member.id === actorId())
		?.weapons?.map((weapon) => weapon.weaponSplId);

describe("settings action: UPDATE_MATCH_PROFILE", () => {
	beforeEach(async () => {
		await users.create(1, null, {
			matchProfile: { weaponPool: [{ id: OLD_WEAPON_ID, isFavorite: false }] },
		});
	});

	test("a new weapon pool is shown to the queue right away", async () => {
		await SQGroupFactory.create({ memberUserIds: [actorId()] });
		await refreshSendouQInstance();

		await updateWeaponPool(NEW_WEAPON_ID);

		expect(ownWeaponsInQueue()).toEqual([NEW_WEAPON_ID]);
	});

	test("updates the weapon pool of a user who is not queueing", async () => {
		await updateWeaponPool(NEW_WEAPON_ID);

		const weaponPool = await MatchProfileRepository.findWeaponPoolByUserId(
			actorId(),
		);
		expect(weaponPool.map((weapon) => weapon.weaponSplId)).toEqual([
			NEW_WEAPON_ID,
		]);
	});
});

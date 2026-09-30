import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { SENDOUQ_PAGE } from "~/utils/urls";
import { qSearchParams, weaponUsageSearchParams } from "./q-search-params";

export const sendouQInviteLink = (inviteCode: string) =>
	qSearchParams.href(SENDOUQ_PAGE, { join: inviteCode });

export const getWeaponUsage = (args: {
	userId: number;
	season: number;
	modeShort: ModeShort;
	stageId: StageId;
}) => weaponUsageSearchParams.href("/weapon-usage", args);

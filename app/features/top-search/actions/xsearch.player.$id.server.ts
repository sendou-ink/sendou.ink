import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { syncXPBadges } from "~/features/badges/queries/syncXPBadges.server";
import { logger } from "~/utils/logger";
import {
	errorToastIfFalsy,
	notFoundIfFalsy,
	parseParams,
	successToast,
} from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import * as XRankPlacementRepository from "../XRankPlacementRepository.server";

export const action = async ({ params }: ActionFunctionArgs) => {
	const user = await requireUser();
	const { id } = parseParams({
		params,
		schema: idObject,
	});

	const placements = notFoundIfFalsy(
		await XRankPlacementRepository.findPlacementsByPlayerId(id),
	);
	const currentLinkedUserDiscordId = placements[0].discordId;

	errorToastIfFalsy(
		currentLinkedUserDiscordId === user.discordId,
		"This player is not linked to you",
	);

	logger.info("Unlinking player", {
		id: id,
		userId: user.id,
	});

	await XRankPlacementRepository.unlinkPlayerByUserId(user.id);

	syncXPBadges();

	return successToast("Unlink successful");
};

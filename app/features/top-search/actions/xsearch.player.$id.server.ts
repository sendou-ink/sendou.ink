import type { ActionFunctionArgs } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import { syncXPBadges } from "~/features/badges/queries/syncXPBadges.server";
import { findPlacementsByPlayerId } from "~/features/top-search/queries/findPlacements.server";
import { logger } from "~/utils/logger";
import {
	errorToastIfFalsy,
	notFoundIfFalsy,
	parseParams,
	successToast,
} from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import * as SplatoonPlayerRepository from "../SplatoonPlayerRepository.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const user = await requireUser(request);
	const { id } = parseParams({
		params,
		schema: idObject,
	});

	const placements = notFoundIfFalsy(findPlacementsByPlayerId(id));
	const currentLinkedUserDiscordId = placements[0].discordId;

	errorToastIfFalsy(
		currentLinkedUserDiscordId === user.discordId,
		"This player is not linked to you",
	);

	logger.info("Unlinking player", {
		id: id,
		userId: user.id,
	});

	await SplatoonPlayerRepository.unlinkPlayerByUserId(user.id);

	syncXPBadges();

	return successToast("Unlink successful");
};

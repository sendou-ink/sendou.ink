import type { ActionFunction } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import { clearTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import { isMod } from "~/permissions";
import {
	badRequestIfFalsy,
	errorToastIfFalsy,
	parseRequestPayload,
} from "~/utils/remix.server";
import * as ImageRepository from "../ImageRepository.server";
import { validateImage } from "../queries/validateImage";
import { validateImageSchema } from "../upload-schemas.server";

export const action: ActionFunction = async ({ request }) => {
	const user = await requireUserId(request);
	const data = await parseRequestPayload({
		schema: validateImageSchema,
		request,
	});

	errorToastIfFalsy(isMod(user), "Only admins can validate images");

	const image = badRequestIfFalsy(await ImageRepository.findById(data.imageId));

	validateImage(data.imageId);

	if (image.tournamentId) {
		clearTournamentDataCache(image.tournamentId);
	}

	return null;
};

import type { ActionFunction } from "react-router";
import { clearTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import { requireRole } from "~/modules/permissions/guards.server";
import {
	badRequestIfFalsy,
	parseRequestPayload,
	successToast,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as ImageRepository from "../ImageRepository.server";
import { validateImageSchema } from "../upload-schemas";

export const action: ActionFunction = async ({ request }) => {
	requireRole("STAFF");

	const data = await parseRequestPayload({
		schema: validateImageSchema,
		request,
	});

	switch (data._action) {
		case "VALIDATE": {
			for (const imageId of data.imageIds) {
				const image = badRequestIfFalsy(
					await ImageRepository.findById(imageId),
				);

				await ImageRepository.validateById(imageId);

				if (image.tournamentId) {
					clearTournamentDataCache(image.tournamentId);
				}
			}
			break;
		}
		case "REJECT": {
			await ImageRepository.deleteById(data.imageId);

			return successToast("The image was deleted");
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};

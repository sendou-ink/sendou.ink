import type { ActionFunction } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import { clearTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import { requireRole } from "~/modules/permissions/guards.server";
import {
	badRequestIfFalsy,
	parseRequestPayload,
	successToast,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as ImageRepository from "../ImageRepository.server";
import { validateImage } from "../queries/validateImage";
import { validateImageSchema } from "../upload-schemas.server";

export const action: ActionFunction = async ({ request }) => {
	const user = await requireUser(request);
	requireRole(user, "STAFF");

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

				validateImage(imageId);

				if (image.tournamentId) {
					clearTournamentDataCache(imageId);
				}
			}
			break;
		}
		case "REJECT": {
			await ImageRepository.deleteImageById(data.imageId);

			return successToast("The image was deleted");
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};

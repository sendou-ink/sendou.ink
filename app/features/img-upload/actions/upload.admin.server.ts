import { clearTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import { defineAction } from "~/form/define-action.server";
import { requireRole } from "~/modules/permissions/guards.server";
import { badRequestIfFalsy, successToast } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as ImageRepository from "../ImageRepository.server";
import { validateImageSchema } from "../upload-schemas";

export const action = defineAction(
	{ body: validateImageSchema },
	async ({ body }) => {
		requireRole("STAFF");

		switch (body._action) {
			case "VALIDATE": {
				for (const imageId of body.imageIds) {
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
				await ImageRepository.deleteById(body.imageId);

				return successToast("The image was deleted");
			}
			default: {
				assertUnreachable(body);
			}
		}

		return null;
	},
);

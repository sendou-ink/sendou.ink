import type { ActionFunction } from "@remix-run/node";
import * as ArtRepository from "~/features/art/ArtRepository.server";
import { userArtPageActionSchema } from "~/features/art/art-schemas.server";
import { deleteArt } from "~/features/art/queries/deleteArt.server";
import { findArtById } from "~/features/art/queries/findArtById.server";
import { requireUserId } from "~/features/auth/core/user.server";
import { logger } from "~/utils/logger";
import {
	errorToastIfFalsy,
	parseRequestPayload,
	successToast,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";

export const action: ActionFunction = async ({ request }) => {
	const user = await requireUserId(request);
	const data = await parseRequestPayload({
		request,
		schema: userArtPageActionSchema,
	});

	switch (data._action) {
		case "DELETE_ART": {
			// this actually doesn't delete the image itself from the static hosting
			// but the idea is that storage is cheap anyway and if needed later
			// then we can have a routine that checks all the images still current and nukes the rest
			const artToDelete = findArtById(data.id);
			errorToastIfFalsy(
				artToDelete?.authorId === user.id,
				"Insufficient permissions",
			);

			deleteArt(data.id);

			return successToast("Deleting art successful");
		}
		case "UNLINK_ART": {
			logger.info("Unlinking art", {
				userId: user.id,
				artId: data.id,
			});

			await ArtRepository.unlinkUserFromArt({
				userId: user.id,
				artId: data.id,
			});

			return successToast("Unlinking art successful");
		}
		default: {
			assertUnreachable(data);
		}
	}
};

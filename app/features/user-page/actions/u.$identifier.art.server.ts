import type { ActionFunction } from "react-router";
import * as ArtRepository from "~/features/art/ArtRepository.server";
import { userArtPageActionSchema } from "~/features/art/art-schemas.server";
import { requireUser } from "~/features/auth/core/user.server";
import { logger } from "~/utils/logger";
import {
	errorToastIfFalsy,
	parseRequestPayload,
	successToast,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";

export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();
	const data = await parseRequestPayload({
		request,
		schema: userArtPageActionSchema,
	});

	switch (data._action) {
		case "DELETE_ART": {
			// this actually doesn't delete the image itself from the static hosting
			// but the idea is that storage is cheap anyway and if needed later
			// then we can have a routine that checks all the images still current and nukes the rest
			const userArts = await ArtRepository.findArtsByUserId(user.id, {
				includeTagged: false,
			});
			const artToDelete = userArts.find((art) => art.id === data.id);
			errorToastIfFalsy(artToDelete, "Insufficient permissions");

			await ArtRepository.deleteById(data.id);

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

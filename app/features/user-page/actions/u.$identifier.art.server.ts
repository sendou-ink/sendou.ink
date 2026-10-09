import * as ArtRepository from "~/features/art/ArtRepository.server";
import { userArtPageActionSchema } from "~/features/art/art-schemas.server";
import { requireUser } from "~/features/auth/core/user.server";
import { defineAction } from "~/form/define-action.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { logger } from "~/utils/logger";
import { badRequestIfFalsy, successToast } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";

export const action = defineAction(
	{ body: userArtPageActionSchema },
	async ({ body }) => {
		const user = requireUser();

		switch (body._action) {
			case "DELETE_ART": {
				// the image stays on static hosting; storage is cheap and a cleanup routine can come later
				const artToDelete = badRequestIfFalsy(
					await ArtRepository.findById(body.id),
				);
				requirePermission(artToDelete, "EDIT");

				await ArtRepository.deleteById(body.id);

				return successToast("Deleting art successful");
			}
			case "UNLINK_ART": {
				logger.info("Unlinking art", {
					userId: user.id,
					artId: body.id,
				});

				await ArtRepository.unlinkOwnFromArt(body.id);

				return successToast("Unlinking art successful");
			}
			default: {
				assertUnreachable(body);
			}
		}
	},
);

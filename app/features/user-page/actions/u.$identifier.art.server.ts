import type { ActionFunction } from "@remix-run/node";
import { deleteArtSchema } from "~/features/art/art-schemas.server";
import { deleteArt } from "~/features/art/queries/deleteArt.server";
import { findArtById } from "~/features/art/queries/findArtById.server";
import { requireUserId } from "~/features/auth/core/user.server";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";

export const action: ActionFunction = async ({ request }) => {
	const user = await requireUserId(request);
	const data = await parseRequestPayload({
		request,
		schema: deleteArtSchema,
	});

	// this actually doesn't delete the image itself from the static hosting
	// but the idea is that storage is cheap anyway and if needed later
	// then we can have a routine that checks all the images still current and nukes the rest
	const artToDelete = findArtById(data.id);
	errorToastIfFalsy(
		artToDelete?.authorId === user.id,
		"Insufficient permissions",
	);

	deleteArt(data.id);

	return null;
};

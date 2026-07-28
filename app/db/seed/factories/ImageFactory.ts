import * as ImageRepository from "~/features/img-upload/ImageRepository.server";
import { defineFactory } from "../core/defineFactory";

/**
 * Creates user submitted images, unvalidated as the repository function makes them.
 * An image on its own is an orphan — the queries counting images for approval only
 * see it once something (a calendar event avatar, a team logo) points at it.
 *
 * Art brings its own image, see `ArtFactory`.
 */
export const { create } = defineFactory({
	defaults: ({ seq }) => ({
		url: `image-${seq}.png`,
		validatedAt: null,
	}),
	insert: ImageRepository.insert,
});

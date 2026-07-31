import * as ImageRepository from "~/features/img-upload/ImageRepository.server";
import { numberedLogoFilename } from "../../../../scripts/seed-art-urls";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<typeof ImageRepository.insert>[0];

type Options = {
	/** Has an admin approved the image, making it show wherever it is used? */
	isValidated: boolean;
};

/**
 * Creates user submitted images, unvalidated as the repository function makes them.
 * An image on its own is an orphan — the queries counting images for approval only
 * see it once something (a calendar event avatar, a team logo) points at it.
 *
 * The url is one of the numbered logos seeded to the local image storage, so that an
 * image the caller does not name renders in dev instead of 404ing.
 *
 * Art brings its own image, see `ArtFactory`.
 */
export const { create } = defineFactory({
	defaults: ({ seq }) => ({
		url: numberedLogoFilename(seq),
	}),
	insert: (args: Omit<InsertArgs, "validatedAt">) =>
		ImageRepository.insert({ ...args, validatedAt: null }),
	applyOptions: async (image, { isValidated }: Options) => {
		if (!isValidated) return;

		await ImageRepository.validateById(image.id);
	},
});

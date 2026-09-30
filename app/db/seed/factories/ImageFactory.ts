import * as ImageRepository from "~/features/img-upload/ImageRepository.server";
import { numberedLogoFilename } from "../../../../scripts/seed-art-urls";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<typeof ImageRepository.insert>[0];

type Options = {
	/** Has an admin approved the image, making it show wherever it is used? */
	isValidated: boolean;
};

/**
 * Unvalidated by default. An image alone is an orphan: approval queries only see it once something points
 * at it. Default url is a numbered logo seeded to local storage so it renders in dev. Art: see `ArtFactory`.
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

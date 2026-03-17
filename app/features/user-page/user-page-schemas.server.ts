import { z } from "zod";
import { requireUser } from "~/features/auth/core/user.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import * as UserRepository from "./UserRepository.server";
import {
	gearAllOrNoneRefine,
	newBuildBaseSchema,
	userEditProfileBaseSchema,
} from "./user-page-schemas";

export const userEditProfileSchemaServer =
	userEditProfileBaseSchema.superRefine(async (data, ctx) => {
		if (!data.customUrl) return;

		const existingUser = await UserRepository.findByCustomUrl(data.customUrl);
		if (!existingUser) return;

		const currentUser = requireUser();
		if (existingUser.id === currentUser.id) return;

		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "forms:errors.profileCustomUrlDuplicate",
			path: ["customUrl"],
		});
	});

export const newBuildSchemaServer = newBuildBaseSchema
	.refine(gearAllOrNoneRefine.fn, gearAllOrNoneRefine.opts)
	.refine(
		async (data) => {
			if (!data.buildToEditId) return true;

			const user = requireUser();
			const ownerId = await BuildRepository.ownerIdById(data.buildToEditId);

			return ownerId === user.id;
		},
		{ message: "Not a build you own", path: ["buildToEditId"] },
	);

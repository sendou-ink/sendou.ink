import * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import { superRefine, superRefineAsync } from "~/utils/schema";
import { gearAllOrNoneRefine, newBuildBaseSchema } from "./user-page-schemas";

export const newBuildSchemaServer = v.pipeAsync(
	newBuildBaseSchema,
	superRefine((data, ctx) => {
		if (gearAllOrNoneRefine.fn(data)) return;

		ctx.addIssue(gearAllOrNoneRefine.opts);
	}),
	superRefineAsync(async (data, ctx) => {
		if (!data.buildToEditId) return;

		const user = requireUser();
		const ownerId = await BuildRepository.findOwnerIdById(data.buildToEditId);

		if (ownerId === user.id) return;

		ctx.addIssue({ message: "Not a build you own", path: ["buildToEditId"] });
	}),
);

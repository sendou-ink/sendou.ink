import { requireUser } from "~/features/auth/core/user.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import { gearAllOrNoneRefine, newBuildBaseSchema } from "./user-page-schemas";

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

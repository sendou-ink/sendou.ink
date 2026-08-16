import { requireUser } from "~/features/auth/core/user.server";
import { hasPermission } from "~/modules/permissions/utils";
import * as VodRepository from "./VodRepository.server";
import { vodFormBaseSchema } from "./vods-schemas";

export const vodFormSchemaServer = vodFormBaseSchema.refine(
	async (data) => {
		if (!data.vodToEditId) return true;

		const user = requireUser();
		const vod = await VodRepository.findVodById(data.vodToEditId);
		if (!vod) return false;

		return hasPermission(vod, "EDIT", user);
	},
	{ message: "No permissions to edit this VOD", path: ["vodToEditId"] },
);

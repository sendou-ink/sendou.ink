import { requireUser } from "~/features/auth/core/user.server";
import * as VodRepository from "./VodRepository.server";
import { vodFormBaseSchema } from "./vods-schemas";
import { canEditVideo } from "./vods-utils";

export const vodFormSchemaServer = vodFormBaseSchema.refine(
	async (data) => {
		if (!data.vodToEditId) return true;

		const user = requireUser();
		const vod = await VodRepository.findVodById(data.vodToEditId);
		if (!vod) return false;

		return canEditVideo({
			userId: user.id,
			submitterUserId: vod.submitterUserId,
			povUserId: typeof vod.pov === "string" ? undefined : vod.pov?.id,
		});
	},
	{ message: "No permissions to edit this VOD", path: ["vodToEditId"] },
);

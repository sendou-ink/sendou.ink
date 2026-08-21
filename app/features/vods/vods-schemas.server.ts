import * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import { hasPermission } from "~/modules/permissions/utils";
import { superRefineAsync } from "~/utils/schema";
import * as VodRepository from "./VodRepository.server";
import { vodFormBaseSchema } from "./vods-schemas";

export const vodFormSchemaServer = v.pipeAsync(
	vodFormBaseSchema,
	superRefineAsync(async (data, ctx) => {
		if (!data.vodToEditId) return;

		const user = requireUser();
		const vod = await VodRepository.findVodById(data.vodToEditId);
		if (vod && hasPermission(vod, "EDIT", user)) return;

		ctx.addIssue({
			message: "No permissions to edit this VOD",
			path: ["vodToEditId"],
		});
	}),
);

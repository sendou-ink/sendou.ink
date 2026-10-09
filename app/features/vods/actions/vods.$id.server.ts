import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { defineAction } from "~/form/define-action.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { badRequestIfFalsy } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import { userVodsPage } from "~/utils/urls";
import * as VodRepository from "../VodRepository.server";

export const action = defineAction(
	{ params: idObject },
	async ({ params: { id: vodId } }) => {
		const user = requireUser();

		const vod = badRequestIfFalsy(await VodRepository.findVodById(vodId));

		requirePermission(vod, "EDIT");

		await VodRepository.deleteById(vod.id);

		return redirect(userVodsPage(user));
	},
);

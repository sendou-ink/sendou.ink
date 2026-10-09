import { type ActionFunctionArgs, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { badRequestIfFalsy, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import { userVodsPage } from "~/utils/urls";
import * as VodRepository from "../VodRepository.server";

export const action = async ({ params }: ActionFunctionArgs) => {
	const user = requireUser();
	const { id: vodId } = parseParams({ params, schema: idObject });

	const vod = badRequestIfFalsy(await VodRepository.findVodById(vodId));

	requirePermission(vod, "EDIT");

	await VodRepository.deleteById(vod.id);

	return redirect(userVodsPage(user));
};

import { type ActionFunctionArgs, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { badRequestIfFalsy } from "~/utils/remix.server";
import { userVodsPage } from "~/utils/urls";
import * as VodRepository from "../VodRepository.server";

export const action = async ({ params }: ActionFunctionArgs) => {
	const user = requireUser();

	const vod = badRequestIfFalsy(
		await VodRepository.findVodById(Number(params.id)),
	);

	requirePermission(vod, "EDIT");

	await VodRepository.deleteById(vod.id);

	return redirect(userVodsPage(user));
};

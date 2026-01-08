import { type ActionFunction, redirect } from "react-router";
import type { Tables } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import { parseFormData } from "~/form/parse.server";
import { requireRole } from "~/modules/permissions/guards.server";
import { vodVideoPage } from "~/utils/urls";
import * as VodRepository from "../VodRepository.server";
import { vodFormSchemaServer } from "../vods-schemas.server";

export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();
	requireRole(user, "VIDEO_ADDER");

	const result = await parseFormData({
		request,
		schema: vodFormSchemaServer,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const data = result.data;

	let video: Tables["Video"];
	if (data.vodToEditId) {
		video = await VodRepository.update({
			...data.video,
			submitterUserId: user.id,
			isValidated: true,
			id: data.vodToEditId,
		});
	} else {
		video = await VodRepository.insert({
			...data.video,
			submitterUserId: user.id,
			isValidated: true,
		});
	}

	throw redirect(vodVideoPage(video.id));
};

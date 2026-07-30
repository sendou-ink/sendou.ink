import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as PrivateUserNoteRepository from "~/features/sendouq/PrivateUserNoteRepository.server";
import { parseFormData } from "~/form/parse.server";
import { parseParams } from "~/utils/remix.server";
import {
	userCardNoteParamsSchema,
	userCardNoteSchema,
} from "../user-card-schemas";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	requireUser();

	const targetId = parseParams({
		params,
		schema: userCardNoteParamsSchema,
	}).id;
	const result = await parseFormData({
		request,
		schema: userCardNoteSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const data = result.data;

	const isEmptySave =
		data._action === "SAVE" &&
		data.comment === null &&
		data.sentiment === "NEUTRAL";

	if (data._action === "DELETE" || isEmptySave) {
		await PrivateUserNoteRepository.deleteOwnNoteById(targetId);
		return null;
	}

	await PrivateUserNoteRepository.upsertOwnNote({
		targetId,
		sentiment: data.sentiment,
		text: data.comment,
	});

	return null;
};

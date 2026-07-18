import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as PrivateUserNoteRepository from "~/features/sendouq/PrivateUserNoteRepository.server";
import { parseParams, parseRequestPayload } from "~/utils/remix.server";
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
	const data = await parseRequestPayload({
		request,
		schema: userCardNoteSchema,
	});

	const isEmptySave =
		data._action === "SAVE" &&
		data.comment === null &&
		data.sentiment === "NEUTRAL";

	if (data._action === "DELETE" || isEmptySave) {
		await PrivateUserNoteRepository.deleteOwnNoteById(targetId);
		return { ok: true };
	}

	await PrivateUserNoteRepository.upsertOwnNote({
		targetId,
		sentiment: data.sentiment,
		text: data.comment,
	});

	return { ok: true };
};

import { requireUser } from "~/features/auth/core/user.server";
import * as PrivateUserNoteRepository from "~/features/sendouq/PrivateUserNoteRepository.server";
import { defineAction } from "~/form/define-action.server";
import { idObject } from "~/utils/schema";
import { userCardNoteSchema } from "../user-card-schemas";

export const action = defineAction(
	{ params: idObject, body: userCardNoteSchema },
	async ({ params: { id: targetId }, body }) => {
		requireUser();

		const isEmptySave =
			body._action === "SAVE" &&
			body.comment === null &&
			body.sentiment === "NEUTRAL";

		if (body._action === "DELETE" || isEmptySave) {
			await PrivateUserNoteRepository.deleteOwnNoteById(targetId);
			return null;
		}

		await PrivateUserNoteRepository.upsertOwnNote({
			targetId,
			sentiment: body.sentiment,
			text: body.comment,
		});

		return null;
	},
);

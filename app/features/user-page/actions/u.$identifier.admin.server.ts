import type { ActionFunctionArgs } from "react-router";
import * as AdminRepository from "~/features/admin/AdminRepository.server";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { adminTabActionSchema } from "~/features/user-page/user-page-schemas";
import { requireRole } from "~/modules/permissions/guards.server";
import {
	badRequestIfFalsy,
	notFoundIfFalsy,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const loggedInUser = await requireUser(request);

	requireRole(loggedInUser, "STAFF");

	const data = await parseRequestPayload({
		request,
		schema: adminTabActionSchema,
	});

	const user = notFoundIfFalsy(
		await UserRepository.findLayoutDataByIdentifier(params.identifier!),
	);

	switch (data._action) {
		case "ADD_MOD_NOTE": {
			await AdminRepository.addModNote({
				authorId: loggedInUser.id,
				userId: user.id,
				text: data.value,
			});
			break;
		}
		case "DELETE_MOD_NOTE": {
			const note = badRequestIfFalsy(
				await AdminRepository.findModeNoteById(data.noteId),
			);

			if (note.authorId !== loggedInUser.id) {
				throw new Response(null, {
					status: 401,
				});
			}

			await AdminRepository.deleteModNote(data.noteId);
			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};

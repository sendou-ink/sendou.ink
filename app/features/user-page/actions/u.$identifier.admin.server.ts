import * as AdminRepository from "~/features/admin/AdminRepository.server";
import { requireUser } from "~/features/auth/core/user.server";
import { userPageUserId } from "~/features/user-page/user-page-context.server";
import { adminTabActionSchema } from "~/features/user-page/user-page-schemas";
import { defineAction } from "~/form/define-action.server";
import { requireRole } from "~/modules/permissions/guards.server";
import { badRequestIfFalsy, forbidden } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";

export const action = defineAction(
	{ body: adminTabActionSchema },
	async ({ body }) => {
		const loggedInUser = requireUser();

		requireRole("STAFF");

		switch (body._action) {
			case "ADD_MOD_NOTE": {
				await AdminRepository.addModNote({
					userId: userPageUserId(),
					text: body.value,
				});
				break;
			}
			case "DELETE_MOD_NOTE": {
				const note = badRequestIfFalsy(
					await AdminRepository.findModNoteById(body.noteId),
				);

				if (note.authorId !== loggedInUser.id) {
					forbidden();
				}

				await AdminRepository.deleteModNote(body.noteId);
				break;
			}
			default: {
				assertUnreachable(body);
			}
		}

		return null;
	},
);

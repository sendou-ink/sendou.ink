import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { buildsActionSchema } from "~/features/user-page/user-page-schemas";
import { defineAction } from "~/form/define-action.server";
import { errorToastIfFalsy } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { userBuildsPage } from "~/utils/urls";

export const action = defineAction(
	{ body: buildsActionSchema },
	async ({ body }) => {
		const user = requireUser();

		switch (body._action) {
			case "DELETE_BUILD": {
				const ownerId = await BuildRepository.findOwnerIdById(
					body.buildToDeleteId,
				);

				errorToastIfFalsy(ownerId === user.id, "Build to delete not found");

				await BuildRepository.deleteById(body.buildToDeleteId);

				break;
			}
			case "UPDATE_SORTING": {
				await UserRepository.updateOwnBuildSorting(body.buildSorting);

				break;
			}
			default: {
				assertUnreachable(body);
			}
		}

		return redirect(userBuildsPage(user));
	},
);

import { type ActionFunction, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { buildsActionSchema } from "~/features/user-page/user-page-schemas";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { userBuildsPage } from "~/utils/urls";

export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();
	const data = await parseRequestPayload({
		request,
		schema: buildsActionSchema,
	});

	switch (data._action) {
		case "DELETE_BUILD": {
			const ownerId = await BuildRepository.findOwnerIdById(
				data.buildToDeleteId,
			);

			errorToastIfFalsy(ownerId === user.id, "Build to delete not found");

			await BuildRepository.deleteById(data.buildToDeleteId);

			break;
		}
		case "UPDATE_SORTING": {
			await UserRepository.updateOwnBuildSorting(data.buildSorting);

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return redirect(userBuildsPage(user));
};

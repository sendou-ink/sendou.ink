import { type ActionFunction, redirect } from "react-router";
import { z } from "zod/v4";
import { BUILD_SORT_IDENTIFIERS } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { userBuildsPage } from "~/utils/urls";
import {
	_action,
	actualNumber,
	emptyArrayToNull,
	id,
	processMany,
	removeDuplicates,
	safeJSONParse,
} from "~/utils/zod";

export const action: ActionFunction = async ({ request }) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: buildsActionSchema,
	});

	switch (data._action) {
		case "DELETE_BUILD": {
			const usersBuilds = await BuildRepository.allByUserId(user.id, {
				showPrivate: true,
			});

			const buildToDelete = usersBuilds.find(
				(build) => build.id === data.buildToDeleteId,
			);

			errorToastIfFalsy(buildToDelete, "Build to delete not found");

			await BuildRepository.deleteById(data.buildToDeleteId);

			break;
		}
		case "UPDATE_SORTING": {
			await UserRepository.updateBuildSorting({
				userId: user.id,
				buildSorting: data.buildSorting,
			});

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return redirect(userBuildsPage(user));
};

const buildsActionSchema = z.union([
	z.object({
		_action: _action("DELETE_BUILD"),
		buildToDeleteId: z.preprocess(actualNumber, id),
	}),

	z.object({
		_action: _action("UPDATE_SORTING"),
		buildSorting: z.preprocess(
			processMany(safeJSONParse, removeDuplicates, emptyArrayToNull),
			z.array(z.enum(BUILD_SORT_IDENTIFIERS)).nullable(),
		),
	}),
]);

import { type ActionFunction, redirect } from "@remix-run/node";
import { z } from "zod";
import { BUILD_SORT_IDENTIFIERS } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import { refreshBuildsCacheByWeaponSplIds } from "~/features/builds/core/cached-builds.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { logger } from "~/utils/logger";
import { parseRequestPayload, validate } from "~/utils/remix.server";
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
			const usersBuilds = await BuildRepository.allByUserId({
				userId: user.id,
				showPrivate: true,
			});

			const buildToDelete = usersBuilds.find(
				(build) => build.id === data.buildToDeleteId,
			);

			validate(buildToDelete);

			await BuildRepository.deleteById(data.buildToDeleteId);

			try {
				refreshBuildsCacheByWeaponSplIds(
					buildToDelete.weapons.map((weapon) => weapon.weaponSplId),
				);
			} catch (error) {
				logger.warn("Error refreshing builds cache", error);
			}

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

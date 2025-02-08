import type { ActionFunctionArgs } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { parseRequestPayload } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { settingsEditSchema } from "../settings-schemas";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: settingsEditSchema,
	});

	switch (data._action) {
		case "UPDATE_DISABLE_BUILD_ABILITY_SORTING": {
			await UserRepository.updatePreferences(user.id, {
				disableBuildAbilitySorting: data.newValue,
			});
			break;
		}
		case "PLACEHOLDER": {
			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};

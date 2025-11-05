import type { ActionFunctionArgs } from "@remix-run/node";
import { z } from "zod/v4";
import { refreshApiTokensCache } from "~/features/api-public/api-public-utils.server";
import { requireUser } from "~/features/auth/core/user.server";
import { parseRequestPayload, successToast } from "~/utils/remix.server";
import { _action } from "~/utils/zod";
import * as ApiRepository from "../ApiRepository.server";

const apiActionSchema = z.object({
	_action: _action("GENERATE"),
});

export const action = async ({ request }: ActionFunctionArgs) => {
	const data = await parseRequestPayload({
		request,
		schema: apiActionSchema,
	});
	const user = await requireUser(request);

	switch (data._action) {
		case "GENERATE": {
			await ApiRepository.generateToken(user.id);

			await refreshApiTokensCache();

			successToast("API token generated successfully");
			break;
		}
		default: {
			throw new Error("Invalid action");
		}
	}

	return null;
};

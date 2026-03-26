import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { refreshApiTokensCache } from "~/features/api-public/api-public-utils.server";
import { requireUser } from "~/features/auth/core/user.server";
import { parseRequestPayload, successToast } from "~/utils/remix.server";
import * as ApiRepository from "../ApiRepository.server";
import { checkUserHasApiAccess } from "../core/perms";

const apiActionSchema = z.object({
	_action: z.enum(["GENERATE_READ", "GENERATE_WRITE"]),
});

export const action = async ({ request }: ActionFunctionArgs) => {
	const data = await parseRequestPayload({
		request,
		schema: apiActionSchema,
	});
	const user = requireUser();

	const hasApiAccess = await checkUserHasApiAccess(user);
	if (!hasApiAccess) {
		throw new Response("Forbidden", { status: 403 });
	}

	switch (data._action) {
		case "GENERATE_READ": {
			await ApiRepository.generateToken(user.id, "read");
			await refreshApiTokensCache();
			successToast("Read token generated successfully");
			break;
		}
		case "GENERATE_WRITE": {
			await ApiRepository.generateToken(user.id, "write");
			await refreshApiTokensCache();
			successToast("Write token generated successfully");
			break;
		}
		default: {
			throw new Error("Invalid action");
		}
	}

	return null;
};

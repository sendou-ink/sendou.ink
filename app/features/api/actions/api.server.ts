import { refreshApiTokensCache } from "~/features/api-public/api-public-utils.server";
import { requireUser } from "~/features/auth/core/user.server";
import { defineAction } from "~/form/define-action.server";
import { forbidden, successToast } from "~/utils/remix.server";
import * as ApiRepository from "../ApiRepository.server";
import { apiActionSchema } from "../api-schemas";
import { checkUserHasApiAccess } from "../core/perms";

export const action = defineAction(
	{ body: apiActionSchema },
	async ({ body }) => {
		const user = requireUser();

		const hasApiAccess = await checkUserHasApiAccess(user);
		if (!hasApiAccess) {
			forbidden();
		}

		switch (body._action) {
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
	},
);

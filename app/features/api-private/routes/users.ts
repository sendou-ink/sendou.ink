import * as v from "valibot";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { defineAction } from "~/form/define-action.server";
import { canAccessLohiEndpoint, forbidden } from "~/utils/remix.server";

const updateUsersSchema = v.array(
	v.object({
		discordId: v.string(),
		discordName: v.nullable(v.string()),
		discordAvatar: v.optional(v.nullable(v.string()), null),
		discordUniqueName: v.optional(v.nullable(v.string()), null),
	}),
);

export const action = defineAction(
	{
		body: updateUsersSchema,
		onInvalidBody: "badRequest",
		// every member of the crawled Discord servers in one batch
		maxBodyBytes: 32 * 1024 * 1024,
	},
	async ({ request, body }) => {
		if (!canAccessLohiEndpoint(request)) {
			forbidden();
		}

		await UserRepository.updateMany(body);

		return null;
	},
);

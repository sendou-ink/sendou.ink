import type { ActionFunctionArgs } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import { parseRequestPayload, validate } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as TeamRepository from "../../team/TeamRepository.server";
import * as ScrimPostRepository from "../ScrimPostRepository.server";
import { scrimsActionSchema } from "../scrims-schemas";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: scrimsActionSchema,
	});
	switch (data._action) {
		case "NEW_REQUEST": {
			const usersList = async () => {
				if (data.from.mode === "PICKUP") {
					return [user.id, ...data.from.users];
				}

				const teamId = data.from.teamId;
				const team = (await TeamRepository.teamsByMemberUserId(user.id)).find(
					(team) => team.id === teamId,
				);
				validate(team, "User is not a member of this team");

				// xxx: account for role
				return team.members.map((member) => member.id);
			};

			await ScrimPostRepository.insertRequest({
				scrimPostId: data.scrimPostId,
				teamId: data.from.mode === "TEAM" ? data.from.teamId : null,
				users: (await usersList()).map((userId) => ({
					userId,
					isOwner: Number(user.id === userId),
				})),
			});

			break;
		}
		case "ACCEPT_REQUEST": {
			// ...
			break;
		}
		// xxx: not working
		case "CANCEL_REQUEST": {
			const request = (await ScrimPostRepository.findAllRelevant(user.id))
				.flatMap((post) => post.requests)
				.find(
					(request) =>
						request.id === data.scrimPostRequestId &&
						!request.isAccepted &&
						request.users.some((rUser) => rUser.id === user.id),
				);

			validate(request, "Request not found");

			await ScrimPostRepository.deleteRequest(data.scrimPostRequestId);

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};

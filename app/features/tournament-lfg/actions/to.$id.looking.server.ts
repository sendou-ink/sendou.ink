import type { ActionFunctionArgs } from "react-router";
import { parseRequestPayload } from "~/utils/remix.server";
import { lookingSchema } from "../tournament-lfg-schemas.server";

// Phase 5: Implement action handler here
// See app/features/sendouq/actions/q.looking.server.ts for pattern reference

export const action = async ({ request }: ActionFunctionArgs) => {
	const data = await parseRequestPayload({
		request,
		schema: lookingSchema,
	});

	switch (data._action) {
		case "JOIN_QUEUE": {
			// TODO: Implement
			break;
		}
		case "LIKE": {
			// TODO: Implement
			break;
		}
		case "UNLIKE": {
			// TODO: Implement
			break;
		}
		case "ACCEPT": {
			// TODO: Implement
			break;
		}
		case "GIVE_MANAGER": {
			// TODO: Implement
			break;
		}
		case "REMOVE_MANAGER": {
			// TODO: Implement
			break;
		}
		case "UPDATE_NOTE": {
			// TODO: Implement
			break;
		}
		case "UPDATE_STAY_AS_SUB": {
			// TODO: Implement
			break;
		}
	}

	return null;
};

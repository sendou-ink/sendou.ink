import type { ActionFunctionArgs } from "react-router";
import * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import invariant from "~/utils/invariant";
import { parseRequestPayload } from "~/utils/remix.server";
import * as SseConnections from "../core/SseConnections.server";
import * as TopicAccess from "../core/TopicAccess.server";

const topicsSchema = v.object({
	topics: v.pipe(
		v.array(v.pipe(v.string(), v.maxLength(100))),
		v.maxLength(50),
	),
});

export const action = async ({ request, params }: ActionFunctionArgs) => {
	if (request.method !== "PUT") {
		throw new Response(null, { status: 405 });
	}

	const user = requireUser();
	invariant(params.connectionId, "connectionId param is required");

	const data = await parseRequestPayload({ request, schema: topicsSchema });

	for (const topic of data.topics) {
		if (!(await TopicAccess.canSubscribe(user.id, topic))) {
			throw new Response(null, { status: 403 });
		}
	}

	const replaced = SseConnections.replaceTopics(
		params.connectionId,
		user.id,
		data.topics,
	);
	if (!replaced) {
		throw new Response(null, { status: 404 });
	}

	return null;
};

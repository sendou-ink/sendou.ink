import * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import { defineAction } from "~/form/define-action.server";
import { forbidden, notFound } from "~/utils/remix.server";
import * as SseConnections from "../core/SseConnections.server";
import * as TopicAccess from "../core/TopicAccess.server";

const paramsSchema = v.object({ connectionId: v.string() });

const topicsSchema = v.object({
	topics: v.pipe(
		v.array(v.pipe(v.string(), v.maxLength(100))),
		v.maxLength(50),
	),
});

export const action = defineAction(
	{ params: paramsSchema, body: topicsSchema, onInvalidBody: "badRequest" },
	async ({ params: { connectionId }, body, request }) => {
		if (request.method !== "PUT") {
			throw new Response(null, { status: 405 });
		}

		const user = requireUser();

		if (!(await TopicAccess.canSubscribeToAll(user.id, body.topics))) {
			forbidden();
		}

		const replaced = SseConnections.replaceTopics(
			connectionId,
			user.id,
			body.topics,
		);
		if (!replaced) {
			notFound();
		}

		return null;
	},
);

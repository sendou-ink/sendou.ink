import type { ActionFunctionArgs } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import { parseRequestPayload, errorToastIfFalsy } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as ScrimPostRepository from "../ScrimPostRepository.server";
import { scrimsActionSchema } from "../scrims-schemas";
import { usersListForPost } from "./scrims.new.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: scrimsActionSchema,
	});
	switch (data._action) {
		case "DELETE_POST": {
			const post = await findPost({
				userId: user.id,
				postId: data.scrimPostId,
			});

			errorToastIfFalsy(
				post.users.some((rUser) => rUser.id === user.id && rUser.isOwner),
				"No permission to manage the post",
			);

			await ScrimPostRepository.del(post.id);

			break;
		}
		case "NEW_REQUEST": {
			await ScrimPostRepository.insertRequest({
				scrimPostId: data.scrimPostId,
				teamId: data.from.mode === "TEAM" ? data.from.teamId : null,
				users: (
					await usersListForPost({ authorId: user.id, from: data.from })
				).map((userId) => ({
					userId,
					isOwner: Number(user.id === userId),
				})),
			});

			break;
		}
		case "ACCEPT_REQUEST": {
			const { post, request } = await findRequest({
				userId: user.id,
				requestId: data.scrimPostRequestId,
			});

			errorToastIfFalsy(!request.isAccepted, "Request is already accepted");
			errorToastIfFalsy(
				post.users.some((rUser) => rUser.id === user.id && rUser.isOwner),
				"No permission to accept request",
			);

			await ScrimPostRepository.acceptRequest(data.scrimPostRequestId);

			break;
		}
		case "CANCEL_REQUEST": {
			const { request } = await findRequest({
				userId: user.id,
				requestId: data.scrimPostRequestId,
			});

			errorToastIfFalsy(
				!request.isAccepted,
				"Can't cancel an accepted request",
			);
			errorToastIfFalsy(
				request.users.some((rUser) => rUser.id === user.id && rUser.isOwner),
				"No permission to cancel request",
			);

			await ScrimPostRepository.deleteRequest(data.scrimPostRequestId);

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};

async function findPost({
	userId,
	postId,
}: { userId: number; postId: number }) {
	const posts = await ScrimPostRepository.findAllRelevant(userId);
	const post = posts.find((post) => post.id === postId);

	errorToastIfFalsy(post, "Post not found");

	return post;
}

async function findRequest({
	userId,
	requestId,
}: { userId: number; requestId: number }) {
	const posts = await ScrimPostRepository.findAllRelevant(userId);
	const post = posts.find((post) =>
		post.requests.some((request) => request.id === requestId),
	);
	const request = post?.requests.find((request) => request.id === requestId);

	errorToastIfFalsy(post && request, "Request not found");

	return { post, request };
}

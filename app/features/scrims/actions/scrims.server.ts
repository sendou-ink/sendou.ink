import type { ActionFunctionArgs } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import { notify } from "~/features/notifications/core/notify.server";
import { requirePermission } from "~/modules/permissions/requirePermission.server";
import { databaseTimestampToDate } from "~/utils/dates";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
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
			requirePermission(post, "DELETE_POST", user);

			await ScrimPostRepository.del(post.id);

			break;
		}
		case "NEW_REQUEST": {
			const post = await findPost({
				userId: user.id,
				postId: data.scrimPostId,
			});

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

			notify({
				userIds: post.users
					.filter((user) => user.isOwner)
					.map((user) => user.id),
				notification: {
					type: "SCRIM_NEW_REQUEST",
					meta: {
						fromUsername: user.username,
					},
				},
			});

			break;
		}
		case "ACCEPT_REQUEST": {
			const { post, request } = await findRequest({
				userId: user.id,
				requestId: data.scrimPostRequestId,
			});
			requirePermission(post, "MANAGE_REQUESTS", user);

			errorToastIfFalsy(!request.isAccepted, "Request is already accepted");

			await ScrimPostRepository.acceptRequest(data.scrimPostRequestId);

			notify({
				userIds: [
					...post.users.map((m) => m.id),
					...request.users.map((m) => m.id),
				],
				defaultSeenUserIds: [user.id],
				notification: {
					type: "SCRIM_SCHEDULED",
					meta: {
						id: post.id,
						timeString: databaseTimestampToDate(post.at).toLocaleString(
							"en-US",
							{
								day: "numeric",
								month: "numeric",
								hour: "numeric",
								minute: "numeric",
							},
						),
					},
				},
			});

			break;
		}
		case "CANCEL_REQUEST": {
			const { request } = await findRequest({
				userId: user.id,
				requestId: data.scrimPostRequestId,
			});
			requirePermission(request, "CANCEL", user);

			errorToastIfFalsy(
				!request.isAccepted,
				"Can't cancel an accepted request",
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

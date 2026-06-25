import { add, sub } from "date-fns";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import * as AssociationsRepository from "~/features/associations/AssociationRepository.server";
import * as Association from "~/features/associations/core/Association";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { datePlaceholder } from "~/features/chat/chat-utils";
import { notify } from "~/features/notifications/core/notify.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import { ConcurrentModificationError } from "~/utils/errors";
import { logger } from "~/utils/logger";
import {
	actionError,
	errorToast,
	errorToastIfFalsy,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { navIconUrl, scrimPage, scrimsPage } from "~/utils/urls";
import * as Scrim from "../core/Scrim";
import * as ScrimPostRepository from "../ScrimPostRepository.server";
import { SCRIM } from "../scrims-constants";
import { type newRequestSchema, scrimsActionSchema } from "../scrims-schemas";
import { generateTimeOptions } from "../scrims-utils";
import { usersListForPost } from "./scrims.new.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = requireUser();

	const data = await parseRequestPayload({
		request,
		schema: scrimsActionSchema,
	});
	switch (data._action) {
		case "DELETE_POST": {
			const post = await findPost({
				postId: data.scrimPostId,
			});
			requirePermission(post, "DELETE_POST");

			errorToastIfFalsy(
				!Scrim.isAccepted(post),
				"Can't delete an accepted scrim, cancel it instead",
			);

			await ScrimPostRepository.del(post.id);

			break;
		}
		case "NEW_REQUEST": {
			const post = await findPost({
				postId: data.scrimPostId,
			});

			if (post.visibility) {
				const associations = await AssociationsRepository.findByMemberUserId(
					user.id,
				);
				const canSeePost = Association.isVisible({
					associations,
					visibility: post.visibility,
					contentOwnerUserId: post.users.find((u) => u.isOwner)?.id,
				});
				errorToastIfFalsy(canSeePost, "Post not found");
			}

			if (post.rangeEnd && !data.at) {
				return actionError<typeof newRequestSchema>({
					msg: "Please select a time for the scrim",
					field: "at",
				});
			}

			if (post.rangeEnd && data.at) {
				const validTimeOptions = generateTimeOptions(
					databaseTimestampToDate(post.at),
					databaseTimestampToDate(post.rangeEnd),
				);
				const requestTime = data.at.getTime();

				if (!validTimeOptions.includes(requestTime)) {
					return actionError<typeof newRequestSchema>({
						msg: "Selected time must be one of the available options",
						field: "at",
					});
				}
			}

			await ScrimPostRepository.insertRequest({
				scrimPostId: data.scrimPostId,
				teamId: data.from.mode === "TEAM" ? data.from.teamId : null,
				message: data.message,
				at: data.at ? dateToDatabaseTimestamp(data.at) : null,
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
				requestId: data.scrimPostRequestId,
			});
			requirePermission(post, "MANAGE_REQUESTS");

			errorToastIfFalsy(!request.isAccepted, "Request is already accepted");

			try {
				await ScrimPostRepository.acceptRequest(data.scrimPostRequestId);
			} catch (error) {
				if (error instanceof ConcurrentModificationError) {
					errorToast(
						"Another request for this scrim was already accepted by someone else",
					);
				}
				throw error;
			}

			const fullPost = await ScrimPostRepository.findById(post.id);
			if (fullPost?.chatCode) {
				ChatSystemMessage.setMetadata({
					chatCode: fullPost.chatCode,
					header: datePlaceholder(
						databaseTimestampToDate(request.at ?? post.at),
					),
					subtitle: "Scrim",
					url: scrimPage(post.id),
					imageUrl: `${navIconUrl("scrims")}.avif`,
					participantUserIds: Scrim.participantIdsListFromAccepted(fullPost),
					expiresAt: add(databaseTimestampToDate(request.at ?? post.at), {
						hours: 3,
					}),
				});
			}

			const postTeamName = Scrim.sideDisplayName(post);
			const requestTeamName = Scrim.sideDisplayName(request);

			notify({
				userIds: post.users.map((m) => m.id),
				defaultSeenUserIds: [user.id],
				notification: {
					type: "SCRIM_SCHEDULED",
					meta: { id: post.id, opponentTeamName: requestTeamName },
				},
			});

			notify({
				userIds: request.users.map((m) => m.id),
				defaultSeenUserIds: [user.id],
				notification: {
					type: "SCRIM_SCHEDULED",
					meta: { id: post.id, opponentTeamName: postTeamName },
				},
			});

			if (fullPost) {
				try {
					const bookedAt = databaseTimestampToDate(
						Scrim.getStartTime(fullPost),
					);
					const startTime = dateToDatabaseTimestamp(
						sub(bookedAt, { hours: SCRIM.AUTO_CANCEL_WINDOW_HOURS }),
					);
					const endTime = dateToDatabaseTimestamp(
						add(bookedAt, { hours: SCRIM.AUTO_CANCEL_WINDOW_HOURS }),
					);

					const { posts, requestIds } =
						await ScrimPostRepository.findPendingOverlapsForUsers({
							userIds: Scrim.participantIdsListFromAccepted(fullPost),
							startTime,
							endTime,
							excludePostId: post.id,
						});

					for (const requestId of requestIds) {
						await ScrimPostRepository.deleteRequest(requestId);
					}

					for (const removed of posts) {
						await ScrimPostRepository.del(removed.id);
						notify({
							userIds: removed.memberIds,
							defaultSeenUserIds: [user.id],
							notification: {
								type: "SCRIM_AUTO_DELETED",
								meta: { at: removed.at },
							},
						});
					}
				} catch (error) {
					logger.error("Failed to auto-cancel overlapping scrims", error);
				}
			}

			break;
		}
		case "CANCEL_REQUEST": {
			const { request } = await findRequest({
				requestId: data.scrimPostRequestId,
			});
			requirePermission(request, "CANCEL");

			errorToastIfFalsy(
				!request.isAccepted,
				"Can't cancel an accepted request",
			);

			await ScrimPostRepository.deleteRequest(data.scrimPostRequestId);

			break;
		}
		case "PERSIST_SCRIM_FILTERS": {
			await UserRepository.updateOwnPreferences({
				defaultScrimsFilters: data.filters,
			});

			return redirect(scrimsPage());
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};

async function findPost({ postId }: { postId: number }) {
	const posts = await ScrimPostRepository.findAllRelevant();
	const post = posts.find((post) => post.id === postId);

	errorToastIfFalsy(post, "Post not found");

	return post;
}

async function findRequest({ requestId }: { requestId: number }) {
	const posts = await ScrimPostRepository.findAllRelevant();
	const post = posts.find((post) =>
		post.requests.some((request) => request.id === requestId),
	);
	const request = post?.requests.find((request) => request.id === requestId);

	errorToastIfFalsy(post && request, "Request not found");

	return { post, request };
}

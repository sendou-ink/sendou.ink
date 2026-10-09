import { add, sub } from "date-fns";
import { redirect } from "react-router";
import * as AssociationsRepository from "~/features/associations/AssociationRepository.server";
import * as Association from "~/features/associations/core/Association";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { notify } from "~/features/notifications/core/notify.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { defineAction } from "~/form/define-action.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import {
	ConcurrentModificationError,
	DuplicateEntryError,
} from "~/utils/errors";
import { logger } from "~/utils/logger";
import { errorToast, errorToastIfFalsy } from "~/utils/remix.server";
import { toDBBoolean } from "~/utils/sql";
import { assertUnreachable } from "~/utils/types";
import { scrimsPage } from "~/utils/urls";
import * as Scrim from "../core/Scrim";
import * as ScrimPostRepository from "../ScrimPostRepository.server";
import { SCRIM } from "../scrims-constants";
import { scrimsActionSchema } from "../scrims-schemas";
import { generateTimeOptions } from "../scrims-utils";
import { usersListForPost, validatePickup } from "./scrims.new.server";

export const action = defineAction(
	{ body: scrimsActionSchema },
	async ({ body }) => {
		const user = requireUser();

		switch (body._action) {
			case "DELETE_POST": {
				const post = await findPost({
					postId: body.scrimPostId,
				});
				requirePermission(post, "DELETE_POST");

				errorToastIfFalsy(
					!Scrim.isAccepted(post),
					"Can't delete an accepted scrim, cancel it instead",
				);

				await ScrimPostRepository.deleteById(post.id);

				// requests to the deleted post can no longer be accepted
				await resolveNotifications({
					userIds: post.users.filter((u) => u.isOwner).map((u) => u.id),
					type: "SCRIM_NEW_REQUEST",
					meta: { scrimPostId: post.id },
				});

				break;
			}
			case "NEW_REQUEST": {
				const post = await findPost({
					postId: body.scrimPostId,
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

				if (body.from.mode === "PICKUP") {
					const pickupUserError = await validatePickup(
						body.from.users,
						user.id,
					);
					if (pickupUserError) {
						return { fieldErrors: { from: pickupUserError.error } };
					}
				}

				if (post.rangeEndsAt && !body.at) {
					return {
						fieldErrors: { at: "Please select a time for the scrim" },
					};
				}

				if (post.rangeEndsAt && body.at) {
					const validTimeOptions = generateTimeOptions(
						databaseTimestampToDate(post.startsAt),
						databaseTimestampToDate(post.rangeEndsAt),
					);
					const requestTime = body.at.getTime();

					if (!validTimeOptions.includes(requestTime)) {
						return {
							fieldErrors: {
								at: "Selected time must be one of the available options",
							},
						};
					}
				}

				try {
					await ScrimPostRepository.insertRequest({
						scrimPostId: body.scrimPostId,
						teamId: body.from.mode === "TEAM" ? body.from.teamId : null,
						message: body.message,
						startsAt:
							post.rangeEndsAt && body.at
								? dateToDatabaseTimestamp(body.at)
								: null,
						users: (
							await usersListForPost({ authorId: user.id, from: body.from })
						).map((userId) => ({
							userId,
							isOwner: toDBBoolean(user.id === userId),
						})),
					});
				} catch (error) {
					if (error instanceof DuplicateEntryError) {
						errorToast("Your team has already requested this scrim");
					}
					throw error;
				}

				notify({
					userIds: post.users
						.filter((postUser) => postUser.isOwner)
						.map((postUser) => postUser.id),
					notification: {
						type: "SCRIM_NEW_REQUEST",
						meta: {
							fromUserId: user.id,
							fromUsername: user.username,
							scrimPostId: post.id,
						},
					},
				});

				break;
			}
			case "ACCEPT_REQUEST": {
				const { post, request: scrimRequest } = await findRequest({
					requestId: body.scrimPostRequestId,
				});
				requirePermission(post, "MANAGE_REQUESTS");

				errorToastIfFalsy(
					!scrimRequest.isAccepted,
					"Request is already accepted",
				);

				try {
					await ScrimPostRepository.acceptRequest(body.scrimPostRequestId);
				} catch (error) {
					if (error instanceof ConcurrentModificationError) {
						errorToast(
							"Another request for this scrim was already accepted by someone else",
						);
					}
					throw error;
				}

				// accepting one request settles the post, the rest can no longer be accepted
				await resolveNotifications({
					userIds: post.users.filter((u) => u.isOwner).map((u) => u.id),
					type: "SCRIM_NEW_REQUEST",
					meta: { scrimPostId: post.id },
				});

				const fullPost = await ScrimPostRepository.findById(post.id);

				const postTeamName = Scrim.sideDisplayName(post);
				const requestTeamName = Scrim.sideDisplayName(scrimRequest);

				notify({
					userIds: post.users.map((m) => m.id),
					defaultSeenUserIds: [user.id],
					notification: {
						type: "SCRIM_SCHEDULED",
						meta: { id: post.id, opponentTeamName: requestTeamName },
					},
				});

				notify({
					userIds: scrimRequest.users.map((m) => m.id),
					defaultSeenUserIds: [user.id],
					notification: {
						type: "SCRIM_SCHEDULED",
						meta: { id: post.id, opponentTeamName: postTeamName },
					},
				});

				if (fullPost) {
					// accepting the request is what creates the scrim's chat room
					ChatSystemMessage.notifyRoomsChanged(
						Scrim.participantIdsListFromAccepted(fullPost),
					);

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
							await ScrimPostRepository.deleteById(removed.id);
							notify({
								userIds: removed.memberIds,
								defaultSeenUserIds: [user.id],
								notification: {
									type: "SCRIM_AUTO_DELETED",
									meta: { at: removed.startsAt },
								},
							});
							await resolveNotifications({
								userIds: removed.memberIds,
								type: "SCRIM_NEW_REQUEST",
								meta: { scrimPostId: removed.id },
							});
						}
					} catch (error) {
						logger.error("Failed to auto-cancel overlapping scrims", error);
					}
				}

				break;
			}
			case "CANCEL_REQUEST": {
				const { post, request: scrimRequest } = await findRequest({
					requestId: body.scrimPostRequestId,
				});
				requirePermission(scrimRequest, "CANCEL");

				errorToastIfFalsy(
					!scrimRequest.isAccepted,
					"Can't cancel an accepted request",
				);

				await ScrimPostRepository.deleteRequest(body.scrimPostRequestId);

				const requestOwner = scrimRequest.users.find((u) => u.isOwner);
				if (requestOwner) {
					await resolveNotifications({
						userIds: post.users.filter((u) => u.isOwner).map((u) => u.id),
						type: "SCRIM_NEW_REQUEST",
						meta: {
							scrimPostId: post.id,
							fromUserId: requestOwner.id,
						},
					});
				}

				break;
			}
			case "PERSIST_SCRIM_FILTERS": {
				await UserRepository.updateOwnPreferences({
					defaultScrimsFilters: body.filters,
				});

				return redirect(scrimsPage());
			}
			default: {
				assertUnreachable(body);
			}
		}

		return null;
	},
);

async function findPost({ postId }: { postId: number }) {
	const posts = await ScrimPostRepository.findAllRelevant();
	const post = posts.find((candidate) => candidate.id === postId);

	errorToastIfFalsy(post, "Post not found");

	return post;
}

async function findRequest({ requestId }: { requestId: number }) {
	const posts = await ScrimPostRepository.findAllRelevant();
	const post = posts.find((candidate) =>
		candidate.requests.some((postRequest) => postRequest.id === requestId),
	);
	const request = post?.requests.find(
		(candidate) => candidate.id === requestId,
	);

	errorToastIfFalsy(post && request, "Request not found");

	return { post, request };
}

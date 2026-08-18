import { error } from "@sveltejs/kit";
import invariant from "@sendou/utils/invariant";
import { logger } from "@sendou/utils/logger";
import { assertUnreachable } from "@sendou/utils/types";
import { add, sub } from "date-fns";
import * as R from "remeda";
import * as v from "valibot";
import * as AssociationRepository from "#lib/features/associations/AssociationRepository.server.ts";
import * as Association from "#lib/features/associations/core/Association.ts";
import {
	type AuthenticatedUser,
	getUser,
	requireUser,
} from "#lib/features/auth/user.server.ts";
import { userIsBanned } from "#lib/features/ban/banned.server.ts";
import { ensureScrimChatRoom, markScrimChatRoomInactive, sendSystemMessage } from "#lib/features/chat/chat.server.ts";
import { notify } from "#lib/features/notifications/core/notify.server.ts";
import { resolveNotifications } from "#lib/features/notifications/core/resolve.server.ts";
import * as SQGroupRepository from "#lib/features/sendouq/SQGroupRepository.server.ts";
import * as TeamRepository from "#lib/features/team/TeamRepository.server.ts";
import { getMemberRoleType } from "#lib/features/team/team-utils.ts";
import * as UserRepository from "#lib/features/user-page/UserRepository.server.ts";
import { requirePermission } from "#lib/modules/permissions/guards.server.ts";
import * as Events from "#lib/server/events.ts";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "#lib/utils/dates.ts";
import {
	ConcurrentModificationError,
	DuplicateEntryError,
} from "#lib/utils/errors.ts";
import {
	errorToast,
	errorToastIfFalsy,
	notFoundIfNullish,
} from "#lib/utils/respond.server.ts";
import { id } from "#lib/utils/schemas.ts";
import { toDBBoolean } from "#lib/utils/sql.ts";
import { command, getRequestEvent, query, requested } from "$app/server";
import * as Scrim from "./Scrim.ts";
import * as ScrimMapByMap from "./ScrimMapByMap.ts";
import * as ScrimMapListRepository from "./ScrimMapListRepository.server.ts";
import * as ScrimMapRepository from "./ScrimMapRepository.server.ts";
import * as ScrimPickupRosterRepository from "./ScrimPickupRosterRepository.server.ts";
import * as ScrimPostRepository from "./ScrimPostRepository.server.ts";
import { LUTI_DIVS, SCRIM } from "./scrims-constants.ts";
import {
	acceptRequestSchema,
	cancelRequestSchema,
	cancelScrimFormSchema,
	deletePostSchema,
	type fromSchema,
	newRequestSchema,
	persistScrimFiltersSchema,
	pickMapFormSchema,
	type RANGE_END_OPTIONS,
	removeMapListSchema,
	replayMapSchema,
	reportMapSchema,
	scrimsFiltersSchema,
	scrimsNewFormSchema,
	submitMapListFormSchema,
	undoMapSchema,
} from "./scrims-schemas.ts";
import type { LutiDiv } from "./scrims-types.ts";
import {
	dividePosts,
	generateTimeOptions,
	parseMapPoolInput,
	serializeLutiDiv,
} from "./scrims-utils.ts";

const getScrimPostsSchema = v.object({
	...scrimsFiltersSchema.entries,
	useDefaults: v.boolean(),
});

/** The `/scrims` page data: visible posts divided into tabs plus filter state. */
export const getScrimPosts = query(
	getScrimPostsSchema,
	async ({ weekdayTimes, weekendTimes, divs, useDefaults }) => {
		const user = getUser();

		const associations = user
			? await AssociationRepository.findByMemberUserId(user.id)
			: null;

		const filtersFromSearchParams = { weekdayTimes, weekendTimes, divs };

		// when the user cleared or edited the filters the URL is the whole truth
		// even when it ends up holding no filters at all
		const filters =
			useDefaults && Scrim.filtersAreDefault(filtersFromSearchParams)
				? (user?.preferences?.defaultScrimsFilters ?? Scrim.defaultFilters())
				: filtersFromSearchParams;

		const posts = (await ScrimPostRepository.findAllRelevant())
			.filter(
				(post) =>
					(user && Scrim.isParticipating(post, user.id)) ||
					Association.isVisible({
						associations,
						visibility: post.visibility,
						contentOwnerUserId: post.users.find((u) => u.isOwner)?.id,
					}),
			)
			.map((post) => ({
				...post,
				visibility: null,
				isPrivate: !Association.isPublic({
					visibility: post.visibility,
				}),
			}));

		return {
			posts: dividePosts(posts, user?.id),
			teams: user ? await TeamRepository.findAllByMemberUserId(user.id) : [],
			filters,
			canSaveAsDefault:
				user != null &&
				!R.isDeepEqual(
					filters,
					user.preferences?.defaultScrimsFilters ?? Scrim.defaultFilters(),
				),
		};
	},
);

/** The `/scrims/new` page data. */
export const getScrimsNewData = query(async () => {
	const user = requireUser();

	return {
		teams: await TeamRepository.findAllByMemberUserId(user.id),
		associations: await AssociationRepository.findByMemberUserId(user.id),
		recentPickupRosters: await ScrimPickupRosterRepository.findAllOwnRecent(),
	};
});

/**
 * A booked scrim's page data, streamed live: map-by-map actions by either side
 * wake the stream so both teams see reports/list changes without refreshing
 * (what skalop's revalidation broadcasts did for the React app).
 */
export const getScrim = query.live(
	v.object({ scrimPostId: id }),
	async function* ({ scrimPostId }) {
		let snapshot = await scrimSnapshot(scrimPostId);
		yield snapshot;

		for await (const _ of Events.subscribe(Events.scrimChannel(scrimPostId), {
			signal: getRequestEvent().request.signal,
			// tracking auto-locking is the one change nobody publishes
			wakeAt: () =>
				Scrim.trackingLocksAt(
					snapshot.mapByMap.maps,
					snapshot.mapByMap.mapLists,
				),
		})) {
			snapshot = await scrimSnapshot(scrimPostId);
			yield snapshot;
		}
	},
);

async function scrimSnapshot(scrimPostId: number) {
	const user = requireUser();

	const post = notFoundIfNullish(
		await ScrimPostRepository.findById(scrimPostId),
	);

	if (!Scrim.isAccepted(post)) {
		error(404, "Not found");
	}

	if (!Scrim.isParticipating(post, user.id) && !user.roles.includes("STAFF")) {
		error(403, "Forbidden");
	}

	// visiting the page addresses these notifications
	await resolveNotifications({
		userIds: [user.id],
		type: "SCRIM_SCHEDULED",
		meta: { id: post.id },
	});
	await resolveNotifications({
		userIds: [user.id],
		type: "SCRIM_STARTING_SOON",
		meta: { id: post.id },
	});

	const participantIds = Scrim.participantIdsListFromAccepted(post);

	const chatRoom = await ensureScrimChatRoom({
		scrimPostId: post.id,
		startsAt: Scrim.getStartTime(post),
	});

	return {
		post,
		chatRoomId:
			user.roles.includes("STAFF") || participantIds.includes(user.id)
				? chatRoom.id
				: undefined,
		anyUserPrefersNoScreen:
			await UserRepository.anyUserPrefersNoScreen(participantIds),
		mapByMap: await resolveMapByMap({ post, user }),
	};
}

async function resolveMapByMap({
	post,
	user,
}: {
	post: NonNullable<Awaited<ReturnType<typeof ScrimPostRepository.findById>>>;
	user: AuthenticatedUser;
}) {
	const [mapLists, maps] = await Promise.all([
		ScrimMapListRepository.findMapListsByScrimPostId(post.id),
		ScrimMapRepository.findMapsByScrimPostId(post.id),
	]);

	const pool = mapLists.length > 0 ? ScrimMapByMap.unionPool(mapLists) : null;
	const currentMap = maps.find((m) => m.reportedAt === null) ?? null;
	const viewerSide = Scrim.sideOfUser(post, user.id);
	const locked = Scrim.isTrackingLocked(maps, mapLists);

	const ownList = viewerSide
		? mapLists.find((l) => l.side === viewerSide)
		: undefined;

	return {
		mapLists,
		maps,
		currentMap,
		viewerSide,
		locked,
		pool: pool ? pool.stageModePairs : null,
		ownPool: ownList?.mapList ?? null,
	};
}

export const createScrimPost = command(
	scrimsNewFormSchema,
	async (data) => {
		const user = requireUser();

		if (data.from.mode === "PICKUP") {
			const pickupUserError = await validatePickup(data.from.users, user.id);
			if (pickupUserError) {
				return { fieldErrors: { from: pickupUserError.error } };
			}
		}

		const rangeEndDate = data.rangeEnd
			? resolveRangeEndToDate(data.at, data.rangeEnd as RangeEnd)
			: null;

		const resolvedDivs = data.divs
			? resolveDivs(data.divs as [LutiDiv | null, LutiDiv | null])
			: null;

		await ScrimPostRepository.insert({
			startsAt: dateToDatabaseTimestamp(data.at),
			rangeEndsAt: rangeEndDate
				? dateToDatabaseTimestamp(rangeEndDate)
				: null,
			maxDiv: resolvedDivs?.[0] ? serializeLutiDiv(resolvedDivs[0]) : null,
			minDiv: resolvedDivs?.[1] ? serializeLutiDiv(resolvedDivs[1]) : null,
			text: data.postText,
			managedByAnyone: data.managedByAnyone,
			maps:
				data.maps === "NO_PREFERENCE" || data.maps === "TOURNAMENT"
					? null
					: (data.maps as "SZ" | "RANKED" | "ALL"),
			mapsTournamentId: data.mapsTournamentId,
			isScheduledForFuture:
				data.at >
				// 10 minutes is an arbitrary threshold
				add(new Date(), {
					minutes: 10,
				}),
			visibility:
				data.baseVisibility !== "PUBLIC"
					? {
							forAssociation: data.baseVisibility,
							notFoundInstructions: data.notFoundVisibility.at
								? [
										{
											at: dateToDatabaseTimestamp(
												data.notFoundVisibility.at,
											),
											forAssociation:
												data.notFoundVisibility.forAssociation !== "PUBLIC"
													? data.notFoundVisibility.forAssociation
													: null,
										},
									]
								: undefined,
						}
					: null,
			teamId: data.from.mode === "TEAM" ? data.from.teamId : null,
			users: (
				await usersListForPost({ authorId: user.id, from: data.from })
			).map((userId) => ({
				userId,
				isOwner: toDBBoolean(user.id === userId),
			})),
		});

		if (data.from.mode === "PICKUP") {
			await ScrimPickupRosterRepository.upsertOwn(data.from.users);
		}

		Events.publish(Events.scrimPostsChannel());
		return null;
	},
);

export const deleteScrimPost = command(
	deletePostSchema,
	async ({ scrimPostId }) => {
		requireUser();

		const post = await findPost({ postId: scrimPostId });
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

		await requested(getScrimPosts, 5).refreshAll();
	},
);

export const newScrimRequest = command(newRequestSchema, async (data) => {
	const user = requireUser();

	const post = await findPost({ postId: data.scrimPostId });

	if (post.visibility) {
		const associations = await AssociationRepository.findByMemberUserId(
			user.id,
		);
		const canSeePost = Association.isVisible({
			associations,
			visibility: post.visibility,
			contentOwnerUserId: post.users.find((u) => u.isOwner)?.id,
		});
		errorToastIfFalsy(canSeePost, "Post not found");
	}

	if (data.from.mode === "PICKUP") {
		const pickupUserError = await validatePickup(data.from.users, user.id);
		if (pickupUserError) {
			return { fieldErrors: { from: pickupUserError.error } };
		}
	}

	if (post.rangeEndsAt && !data.at) {
		return {
			fieldErrors: { at: "Please select a time for the scrim" },
		};
	}

	if (post.rangeEndsAt && data.at) {
		const validTimeOptions = generateTimeOptions(
			databaseTimestampToDate(post.startsAt),
			databaseTimestampToDate(post.rangeEndsAt),
		);
		const requestTime = data.at.getTime();

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
			scrimPostId: data.scrimPostId,
			teamId: data.from.mode === "TEAM" ? data.from.teamId : null,
			message: data.message,
			startsAt:
				post.rangeEndsAt && data.at ? dateToDatabaseTimestamp(data.at) : null,
			users: (
				await usersListForPost({ authorId: user.id, from: data.from })
			).map((userId) => ({
				userId,
				isOwner: toDBBoolean(user.id === userId),
			})),
		});
	} catch (thrown) {
		if (thrown instanceof DuplicateEntryError) {
			errorToast("Your team has already requested this scrim");
		}
		throw thrown;
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

	Events.publish(Events.scrimPostsChannel());
	await requested(getScrimPosts, 5).refreshAll();
	return null;
});

export const acceptScrimRequest = command(
	acceptRequestSchema,
	async ({ scrimPostRequestId }) => {
		const user = requireUser();

		const { post, request } = await findRequest({
			requestId: scrimPostRequestId,
		});
		requirePermission(post, "MANAGE_REQUESTS");

		errorToastIfFalsy(!request.isAccepted, "Request is already accepted");

		try {
			await ScrimPostRepository.acceptRequest(scrimPostRequestId);
		} catch (thrown) {
			if (thrown instanceof ConcurrentModificationError) {
				errorToast(
					"Another request for this scrim was already accepted by someone else",
				);
			}
			throw thrown;
		}

		// accepting one request settles the post, the rest can no longer be accepted
		await resolveNotifications({
			userIds: post.users.filter((u) => u.isOwner).map((u) => u.id),
			type: "SCRIM_NEW_REQUEST",
			meta: { scrimPostId: post.id },
		});

		const fullPost = await ScrimPostRepository.findById(post.id);
		if (fullPost) {
			await ensureScrimChatRoom({
				scrimPostId: fullPost.id,
				startsAt: Scrim.getStartTime(fullPost),
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
				const bookedAt = databaseTimestampToDate(Scrim.getStartTime(fullPost));
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
			} catch (thrown) {
				logger.error("Failed to auto-cancel overlapping scrims", thrown);
			}
		}

		Events.publish(Events.scrimPostsChannel());
		await requested(getScrimPosts, 5).refreshAll();
	},
);

export const cancelScrimRequest = command(
	cancelRequestSchema,
	async ({ scrimPostRequestId }) => {
		requireUser();

		const { post, request } = await findRequest({
			requestId: scrimPostRequestId,
		});
		requirePermission(request, "CANCEL");

		errorToastIfFalsy(!request.isAccepted, "Can't cancel an accepted request");

		await ScrimPostRepository.deleteRequest(scrimPostRequestId);

		const requestOwner = request.users.find((u) => u.isOwner);
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

		Events.publish(Events.scrimPostsChannel());
		await requested(getScrimPosts, 5).refreshAll();
	},
);

export const persistScrimFilters = command(
	persistScrimFiltersSchema,
	async ({ filters }) => {
		requireUser();

		await UserRepository.updateOwnPreferences({
			defaultScrimsFilters: filters,
		});

		await requested(getScrimPosts, 5).refreshAll();
	},
);

export const cancelScrim = command(cancelScrimFormSchema, async (data) => {
	const user = requireUser();

	const post = notFoundIfNullish(
		await ScrimPostRepository.findById(data.scrimPostId),
	);

	requirePermission(post, "MANAGE_TRACKING");
	requirePermission(post, "CANCEL");

	errorToastIfFalsy(Scrim.isAccepted(post), "Scrim is not accepted");
	errorToastIfFalsy(!post.canceled, "Scrim is already canceled");

	if (databaseTimestampToDate(Scrim.getStartTime(post)) < new Date()) {
		errorToast("Cannot cancel a scrim that was already scheduled to start");
	}

	await ScrimPostRepository.cancelScrim(post.id, data.reason);

	const acceptedRequest = post.requests.find((r) => r.isAccepted);
	if (acceptedRequest) {
		const postTeamName = Scrim.sideDisplayName(post);
		const requestTeamName = Scrim.sideDisplayName(acceptedRequest);

		notify({
			userIds: post.users.map((m) => m.id),
			defaultSeenUserIds: [user.id],
			notification: {
				type: "SCRIM_CANCELED",
				meta: { id: post.id, opponentTeamName: requestTeamName },
			},
		});

		notify({
			userIds: acceptedRequest.users.map((m) => m.id),
			defaultSeenUserIds: [user.id],
			notification: {
				type: "SCRIM_CANCELED",
				meta: { id: post.id, opponentTeamName: postTeamName },
			},
		});

		// the canceled scrim is no longer happening
		const participantIds = [
			...post.users.map((m) => m.id),
			...acceptedRequest.users.map((m) => m.id),
		];
		await resolveNotifications({
			userIds: participantIds,
			type: "SCRIM_SCHEDULED",
			meta: { id: post.id },
		});
		await resolveNotifications({
			userIds: participantIds,
			type: "SCRIM_STARTING_SOON",
			meta: { id: post.id },
		});
	}

	await markScrimChatRoomInactive(post.id);

	Events.publish(Events.scrimChannel(post.id));
	Events.publish(Events.scrimPostsChannel());
	await requested(getScrimPosts, 5).refreshAll();
	return null;
});

export const submitMapList = command(submitMapListFormSchema, async (data) => {
	const { post, viewerSide } = await requireMapByMapActor(data.scrimPostId);

	if (data.source === "FROM_POST") {
		errorToastIfFalsy(post.mapsTournament, "Post has no tournament to use");
	}

	const serializedPool =
		data.source === "POOL"
			? (parseMapPoolInput(data.serializedPool!)?.serialized ?? null)
			: null;

	errorToastIfFalsy(
		data.source !== "POOL" || serializedPool,
		"Invalid map pool",
	);

	const resolvedSource: "POOL" | "TOURNAMENT" =
		data.source === "POOL" ? "POOL" : "TOURNAMENT";

	await ScrimMapListRepository.submitMapListAndGenerateIfNeeded({
		scrimPostId: post.id,
		side: viewerSide,
		source: resolvedSource,
		tournamentId:
			data.source === "FROM_POST"
				? post.mapsTournament!.id
				: (data.tournamentId ?? null),
		serializedPool,
	});

	Events.publish(Events.scrimChannel(post.id));
	return null;
});

export const removeMapList = command(
	removeMapListSchema,
	async ({ scrimPostId }) => {
		const { post, viewerSide } = await requireMapByMapActor(scrimPostId);

		await ScrimMapListRepository.deleteMapList(post.id, viewerSide);

		Events.publish(Events.scrimChannel(post.id));
	},
);

export const reportMap = command(reportMapSchema, async (data) => {
	const { post, maps } = await requireMapByMapActor(data.scrimPostId);

	const target = maps.find((m) => m.id === data.mapId);
	errorToastIfFalsy(target, "Map not found");
	errorToastIfFalsy(target!.reportedAt === null, "Map already reported");

	await ScrimMapRepository.reportMapAndGenerateNext({
		scrimPostId: post.id,
		mapId: data.mapId,
		winnerSide: data.winnerSide,
	});

	Events.publish(Events.scrimChannel(post.id));
});

export const undoMap = command(undoMapSchema, async ({ scrimPostId }) => {
	const { post, maps } = await requireMapByMapActor(scrimPostId);

	const latest = Scrim.lastReportedMap(maps);
	errorToastIfFalsy(ScrimMapByMap.canUndo(latest, maps), "Nothing to undo");

	await ScrimMapRepository.undoMostRecentMap(post.id);

	Events.publish(Events.scrimChannel(post.id));
});

export const replayMap = command(replayMapSchema, async ({ scrimPostId }) => {
	const { post, maps, user } = await requireMapByMapActor(scrimPostId);

	const latest = Scrim.lastReportedMap(maps);
	errorToastIfFalsy(latest, "No map to replay");

	const currentMap = maps.find((m) => m.reportedAt === null);
	errorToastIfFalsy(currentMap, "No current map to replace");

	await ScrimMapRepository.replaceCurrentMap({
		scrimPostId: post.id,
		mode: latest!.mode,
		stageId: latest!.stageId,
	});

	await broadcastMapChange({ post, type: "MAP_REPLAYED", user });
	Events.publish(Events.scrimChannel(post.id));
});

export const pickMap = command(pickMapFormSchema, async (data) => {
	const { post, maps, user } = await requireMapByMapActor(data.scrimPostId);

	const currentMap = maps.find((m) => m.reportedAt === null);
	errorToastIfFalsy(currentMap, "No current map to replace");

	await ScrimMapRepository.replaceCurrentMap({
		scrimPostId: post.id,
		mode: data.mode,
		stageId: data.stageId,
	});

	await broadcastMapChange({ post, type: "MAP_PICKED", user });
	Events.publish(Events.scrimChannel(post.id));
	return null;
});

/** Loads the post + map-by-map context, gating on tracking permission & lock. */
async function requireMapByMapActor(scrimPostId: number) {
	const user = requireUser();
	const post = notFoundIfNullish(
		await ScrimPostRepository.findById(scrimPostId),
	);

	requirePermission(post, "MANAGE_TRACKING");

	const viewerSide = Scrim.sideOfUser(post, user.id);

	const [maps, mapLists] = await Promise.all([
		ScrimMapRepository.findMapsByScrimPostId(post.id),
		ScrimMapListRepository.findMapListsByScrimPostId(post.id),
	]);

	if (Scrim.isTrackingLocked(maps, mapLists)) {
		errorToast("Tracking is locked");
	}

	return { user, post, viewerSide: viewerSide!, maps, mapLists };
}

async function broadcastMapChange({
	post,
	type,
	user,
}: {
	post: { id: number };
	type: "MAP_REPLAYED" | "MAP_PICKED";
	user: AuthenticatedUser;
}) {
	const room = await ensureScrimChatRoom({
		scrimPostId: post.id,
		startsAt: Scrim.getStartTime(
			notFoundIfNullish(await ScrimPostRepository.findById(post.id)),
		),
	});
	await sendSystemMessage({
		chatRoomId: room.id,
		type,
		context: { name: user.username },
	});
}

async function findPost({ postId }: { postId: number }) {
	const posts = await ScrimPostRepository.findAllRelevant();
	const post = posts.find((relevantPost) => relevantPost.id === postId);

	errorToastIfFalsy(post, "Post not found");

	return post!;
}

async function findRequest({ requestId }: { requestId: number }) {
	const posts = await ScrimPostRepository.findAllRelevant();
	const post = posts.find((relevantPost) =>
		relevantPost.requests.some((request) => request.id === requestId),
	);
	const request = post?.requests.find(
		(postRequest) => postRequest.id === requestId,
	);

	errorToastIfFalsy(post && request, "Request not found");

	return { post: post!, request: request! };
}

const usersListForPost = async ({
	from,
	authorId,
}: {
	from: v.InferOutput<typeof fromSchema>;
	authorId: number;
}) => {
	if (from.mode === "PICKUP") {
		return [authorId, ...from.users];
	}

	const teamId = from.teamId;
	const team = (await TeamRepository.findAllByMemberUserId(authorId)).find(
		(memberTeam) => memberTeam.id === teamId,
	);
	errorToastIfFalsy(team, "User is not a member of this team");

	const filteredMembers = team!.members.filter(
		(member) => getMemberRoleType(member) !== "OTHER",
	);

	// handle case when all users are from excluded roles
	const result = (
		filteredMembers.length >= SCRIM.MIN_MEMBERS_PER_TEAM
			? filteredMembers
			: team!.members
	).map((member) => member.id);

	if (result.length < SCRIM.MIN_MEMBERS_PER_TEAM) {
		errorToast("Your team does not have enough members (4) to scrim");
	}

	// ensure author is included in the list even if they match the ignore condition
	return result.includes(authorId) ? result : [authorId, ...result];
};

/** Validates that a pickup roster can be put together by the author. */
async function validatePickup(userIds: number[], authorId: number) {
	if (userIds.includes(authorId)) {
		return { error: "Don't add yourself to the pickup member list" };
	}

	const friendsError = await validatePickupFriends(userIds, authorId);
	if (friendsError) {
		return friendsError;
	}

	const unbannedError = await validatePickupAllUnbanned(userIds);
	if (unbannedError) {
		return unbannedError;
	}

	return null;
}

async function validatePickupFriends(userIds: number[], authorId: number) {
	const unconsentingUsers: string[] = [];

	const friendsData = await SQGroupRepository.findFriendsAndTeammates(authorId);

	for (const userId of userIds) {
		const user = await UserRepository.findLeanById(userId);
		invariant(user, "User not found");

		if (
			user.preferences?.disallowScrimPickupsFromUntrusted &&
			!friendsData.friends.some((friend) => friend.id === userId)
		) {
			unconsentingUsers.push(user.username);
		}
	}

	return unconsentingUsers.length === 0
		? null
		: {
				error: `Following users don't allow non-friends to add: ${unconsentingUsers.join(", ")}. Ask them to add you as a friend.`,
			};
}

async function validatePickupAllUnbanned(userIds: number[]) {
	const bannedFlags = await Promise.all(
		userIds.map((userId) => userIsBanned(userId)),
	);

	return bannedFlags.every((banned) => !banned)
		? null
		: {
				error: "Pickup includes banned users.",
			};
}

type RangeEnd = (typeof RANGE_END_OPTIONS)[number];

function resolveRangeEndToDate(startDate: Date, rangeEnd: RangeEnd): Date {
	switch (rangeEnd) {
		case "+30min":
			return add(startDate, { minutes: 30 });
		case "+1hour":
			return add(startDate, { hours: 1 });
		case "+1.5hours":
			return add(startDate, { hours: 1, minutes: 30 });
		case "+2hours":
			return add(startDate, { hours: 2 });
		case "+2.5hours":
			return add(startDate, { hours: 2, minutes: 30 });
		case "+3hours":
			return add(startDate, { hours: 3 });
		default: {
			assertUnreachable(rangeEnd);
		}
	}
}

function resolveDivs(
	divs: [LutiDiv | null, LutiDiv | null],
): [LutiDiv | null, LutiDiv | null] {
	const [max, min] = divs;
	if (!max || !min) return divs;

	const maxIndex = LUTI_DIVS.indexOf(max);
	const minIndex = LUTI_DIVS.indexOf(min);

	if (minIndex < maxIndex) {
		return [min, max];
	}
	return divs;
}

export type ScrimPageData = Awaited<ReturnType<typeof getScrim>>;

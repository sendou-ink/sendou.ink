import { addHours, sub } from "date-fns";
import { type Insertable, type NotNull, sql } from "kysely";
import type { Tables, TablesInsertable } from "~/db/tables";
import { actorId, actorIdOrNull } from "~/features/auth/core/user.server";
import * as ChatRepository from "~/features/chat/ChatRepository.server";
import {
	databaseTimestampNow,
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import {
	ConcurrentModificationError,
	DuplicateEntryError,
} from "~/utils/errors";
import {
	type CommonUser,
	commonUserSelect,
	concatUserSubmittedImagePrefix,
	jsonArrayFrom,
	jsonBuildObject,
	tournamentLogoWithDefault,
} from "~/utils/kysely.server";
import { db } from "../../db/sql";
import invariant from "../../utils/invariant";
import type { Unwrapped } from "../../utils/types";
import type { AssociationVisibility } from "../associations/associations-types";
import * as Scrim from "./core/Scrim";
import type { ScrimPost, ScrimPostUser } from "./scrims-types";
import { getPostRequestCensor, parseLutiDiv } from "./scrims-utils";

const CHAT_ROOM_LIFESPAN_HOURS = 24;

type InsertArgs = Pick<
	TablesInsertable["ScrimPost"],
	| "startsAt"
	| "rangeEndsAt"
	| "maxDiv"
	| "minDiv"
	| "teamId"
	| "text"
	| "maps"
	| "mapsTournamentId"
> & {
	/** users related to the post other than the author */
	users: Array<Pick<Insertable<Tables["ScrimPostUser"]>, "userId" | "isOwner">>;
	visibility: AssociationVisibility | null;
	managedByAnyone: boolean;
	isScheduledForFuture: boolean;
};

export function insert(args: InsertArgs) {
	if (args.users.length === 0) {
		throw new Error("At least one user must be provided");
	}

	return db.transaction().execute(async (trx) => {
		const newPost = await trx
			.insertInto("ScrimPost")
			.values({
				startsAt: args.startsAt,
				rangeEndsAt: args.rangeEndsAt,
				maxDiv: args.maxDiv,
				minDiv: args.minDiv,
				teamId: args.teamId,
				text: args.text,
				maps: args.maps,
				mapsTournamentId: args.mapsTournamentId,
				visibility: args.visibility ? JSON.stringify(args.visibility) : null,
				managedByAnyone: args.managedByAnyone ? 1 : 0,
				isScheduledForFuture: args.isScheduledForFuture ? 1 : 0,
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("ScrimPostUser")
			.values(args.users.map((user) => ({ ...user, scrimPostId: newPost.id })))
			.execute();

		return newPost.id;
	});
}

type InsertRequestArgs = Pick<
	Insertable<Tables["ScrimPostRequest"]>,
	"scrimPostId" | "teamId" | "message" | "startsAt"
> & {
	users: Array<
		Pick<Insertable<Tables["ScrimPostRequestUser"]>, "userId" | "isOwner">
	>;
};

/** Inserts a request to a scrim post, returning its id. @throws {DuplicateEntryError} if the team already has one for the post. */
export function insertRequest(args: InsertRequestArgs) {
	invariant(args.users.length > 0, "At least one user must be provided");

	return db.transaction().execute(async (trx) => {
		if (typeof args.teamId === "number") {
			const existingTeamRequest = await trx
				.selectFrom("ScrimPostRequest")
				.select("id")
				.where("scrimPostId", "=", args.scrimPostId)
				.where("teamId", "=", args.teamId)
				.executeTakeFirst();

			if (existingTeamRequest) {
				throw new DuplicateEntryError(
					"Team already has a request for this scrim post",
				);
			}
		}

		const newRequest = await trx
			.insertInto("ScrimPostRequest")
			.values({
				scrimPostId: args.scrimPostId,
				teamId: args.teamId,
				message: args.message,
				startsAt: args.startsAt,
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("ScrimPostRequestUser")
			.values(
				args.users.map((user) => ({
					isOwner: user.isOwner,
					userId: user.userId,
					scrimPostRequestId: newRequest.id,
				})),
			)
			.execute();

		return newRequest.id;
	});
}

export function deleteById(scrimPostId: number) {
	return db.transaction().execute(async (trx) => {
		const post = await trx
			.selectFrom("ScrimPost")
			.select("ScrimPost.chatRoomId")
			.where("id", "=", scrimPostId)
			.executeTakeFirst();
		await ChatRepository.deleteRoomsByIds([post?.chatRoomId ?? null], trx);

		await trx.deleteFrom("ScrimPost").where("id", "=", scrimPostId).execute();
	});
}

const baseFindQuery = db
	.selectFrom("ScrimPost")
	.leftJoin("Team", "ScrimPost.teamId", "Team.id")
	.leftJoin("UserSubmittedImage", "Team.avatarImgId", "UserSubmittedImage.id")
	.leftJoin(
		"CalendarEvent",
		"ScrimPost.mapsTournamentId",
		"CalendarEvent.tournamentId",
	)
	.select((eb) => [
		"ScrimPost.id",
		"ScrimPost.startsAt",
		"ScrimPost.rangeEndsAt",
		"ScrimPost.createdAt",
		"ScrimPost.visibility",
		"ScrimPost.maxDiv",
		"ScrimPost.minDiv",
		"ScrimPost.text",
		"ScrimPost.maps",
		"ScrimPost.mapsTournamentId",
		"ScrimPost.managedByAnyone",
		"ScrimPost.canceledAt",
		"ScrimPost.canceledByUserId",
		"ScrimPost.cancelReason",
		"ScrimPost.isScheduledForFuture",
		jsonBuildObject({
			name: eb.ref("Team.name"),
			customUrl: eb.ref("Team.customUrl"),
			avatarUrl: concatUserSubmittedImagePrefix(
				eb.ref("UserSubmittedImage.url"),
			),
		}).as("team"),
		jsonBuildObject({
			id: eb.ref("CalendarEvent.tournamentId"),
			name: eb.ref("CalendarEvent.name"),
			avatarUrl: tournamentLogoWithDefault(eb),
		}).as("mapsTournament"),
		jsonArrayFrom(
			eb
				.selectFrom("ScrimPostUser")
				.innerJoin("User", "ScrimPostUser.userId", "User.id")
				.select((eb) => [
					...commonUserSelect(eb),
					"User.inGameName",
					"ScrimPostUser.isOwner",
				])
				.whereRef("ScrimPostUser.scrimPostId", "=", "ScrimPost.id"),
		).as("users"),
		jsonArrayFrom(
			eb
				.selectFrom("ScrimPostRequest")
				.leftJoin("Team", "ScrimPostRequest.teamId", "Team.id")
				.leftJoin(
					"UserSubmittedImage",
					"Team.avatarImgId",
					"UserSubmittedImage.id",
				)
				.select((innerEb) => [
					"ScrimPostRequest.id",
					"ScrimPostRequest.isAccepted",
					"ScrimPostRequest.createdAt",
					"ScrimPostRequest.message",
					"ScrimPostRequest.startsAt",
					jsonBuildObject({
						name: innerEb.ref("Team.name"),
						customUrl: innerEb.ref("Team.customUrl"),
						avatarUrl: concatUserSubmittedImagePrefix(
							innerEb.ref("UserSubmittedImage.url"),
						),
					}).as("team"),
					jsonArrayFrom(
						innerEb
							.selectFrom("ScrimPostRequestUser")
							.innerJoin("User", "ScrimPostRequestUser.userId", "User.id")
							.select((eb) => [
								...commonUserSelect(eb),
								"User.inGameName",
								"ScrimPostRequestUser.isOwner",
							])
							.whereRef(
								"ScrimPostRequestUser.scrimPostRequestId",
								"=",
								"ScrimPostRequest.id",
							),
					).as("users"),
				])
				.whereRef("ScrimPostRequest.scrimPostId", "=", "ScrimPost.id"),
		).as("requests"),
	]);

/** The booked start of a scrim: the accepted request's chosen time for a range post, the post's own otherwise. */
const bookedStartsAt = sql<number>`coalesce((select "ScrimPostRequest"."startsAt" from "ScrimPostRequest" where "ScrimPostRequest"."scrimPostId" = "ScrimPost"."id" and "ScrimPostRequest"."isAccepted" = 1), "ScrimPost"."startsAt")`;

function findMany() {
	const min = sub(new Date(), { hours: 3 });

	return baseFindQuery
		.orderBy("startsAt", "asc")
		.where("ScrimPost.startsAt", ">=", dateToDatabaseTimestamp(min))
		.execute();
}

const mapDBRowToScrimPost = (
	row: Unwrapped<typeof findMany> & { chatRoomId?: number | null },
): ScrimPost => {
	const someRequestIsAccepted = row.requests.some(
		(request) => request.isAccepted,
	);

	// once one is accepted, rest are not relevant
	const requests = someRequestIsAccepted
		? row.requests.filter((request) => request.isAccepted)
		: row.requests;

	const users: ScrimPostUser[] = row.users.map((user) => ({
		...user,
		isOwner: Boolean(user.isOwner),
	}));

	const ownerIds = users.filter((user) => user.isOwner).map((user) => user.id);
	const managerIds = row.managedByAnyone
		? users.map((user) => user.id)
		: ownerIds;

	let canceled: ScrimPost["canceled"] = null;
	if (row.canceledAt && row.cancelReason) {
		let cancelingUser = users.find((u) => u.id === row.canceledByUserId);
		if (!cancelingUser) {
			const allRequestUsers = requests.flatMap((request) => request.users);
			const found = allRequestUsers.find((u) => u.id === row.canceledByUserId);
			if (found) {
				cancelingUser = { ...found, isOwner: Boolean(found.isOwner) };
			}
		}
		if (cancelingUser) {
			canceled = {
				at: row.canceledAt,
				byUser: cancelingUser,
				reason: row.cancelReason,
			};
		}
	}

	const result = {
		id: row.id,
		startsAt: row.startsAt,
		rangeEndsAt: row.rangeEndsAt,
		createdAt: row.createdAt,
		visibility: row.visibility,
		text: row.text,
		isScheduledForFuture: Boolean(row.isScheduledForFuture),
		divs:
			typeof row.maxDiv === "number" && typeof row.minDiv === "number"
				? { max: parseLutiDiv(row.maxDiv), min: parseLutiDiv(row.minDiv) }
				: null,
		maps: row.maps,
		mapsTournament: row.mapsTournament.id
			? {
					id: row.mapsTournament.id,
					name: row.mapsTournament.name!,
					avatarUrl: row.mapsTournament.avatarUrl,
				}
			: null,
		chatRoomId: row.chatRoomId ?? null,
		team: row.team.name
			? {
					name: row.team.name,
					customUrl: row.team.customUrl!,
					avatarUrl: row.team.avatarUrl,
				}
			: null,
		requests: requests.map((request) => {
			return {
				id: request.id,
				isAccepted: Boolean(request.isAccepted),
				createdAt: request.createdAt,
				message: request.message,
				startsAt: request.startsAt,
				team: request.team.name
					? {
							name: request.team.name,
							customUrl: request.team.customUrl!,
							avatarUrl: request.team.avatarUrl,
						}
					: null,
				users: request.users.map((user) => ({
					...user,
					isOwner: Boolean(user.isOwner),
				})),
				permissions: {
					CANCEL: request.users.map((u) => u.id),
				},
			};
		}),
		users,
		permissions: {
			MANAGE_REQUESTS: managerIds,
			DELETE_POST: managerIds,
			CANCEL: managerIds.concat(requests.at(0)?.users.map((u) => u.id) ?? []),
			MANAGE_TRACKING: someRequestIsAccepted
				? users
						.map((u) => u.id)
						.concat(requests[0]?.users.map((u) => u.id) ?? [])
				: [],
		},
		managedByAnyone: Boolean(row.managedByAnyone),
		canceled,
	};

	if (!Scrim.isAccepted(result)) {
		return result;
	}

	return {
		...result,
		startsAt: Scrim.getStartTime(result),
		rangeEndsAt: null,
	};
};

/** Posts owning the given chat rooms, with the users of the post and of its accepted request. */
export async function findAllByChatRoomIds(chatRoomIds: number[]) {
	if (chatRoomIds.length === 0) return [];

	return db
		.selectFrom("ScrimPost")
		.select((eb) => [
			"ScrimPost.id",
			"ScrimPost.chatRoomId",
			"ScrimPost.startsAt",
			jsonArrayFrom(
				eb
					.selectFrom("ScrimPostUser")
					.select("ScrimPostUser.userId")
					.whereRef("ScrimPostUser.scrimPostId", "=", "ScrimPost.id"),
			).as("postUsers"),
			jsonArrayFrom(
				eb
					.selectFrom("ScrimPostRequestUser")
					.innerJoin(
						"ScrimPostRequest",
						"ScrimPostRequest.id",
						"ScrimPostRequestUser.scrimPostRequestId",
					)
					.select("ScrimPostRequestUser.userId")
					.whereRef("ScrimPostRequest.scrimPostId", "=", "ScrimPost.id")
					.where("ScrimPostRequest.isAccepted", "=", 1),
			).as("acceptedRequestUsers"),
			eb
				.selectFrom("ScrimPostRequest")
				.select("ScrimPostRequest.startsAt")
				.whereRef("ScrimPostRequest.scrimPostId", "=", "ScrimPost.id")
				.where("ScrimPostRequest.isAccepted", "=", 1)
				.limit(1)
				.$asScalar()
				.as("acceptedRequestStartsAt"),
		])
		.where("ScrimPost.chatRoomId", "in", chatRoomIds)
		.$narrowType<{ chatRoomId: NotNull }>()
		.execute();
}

export async function findById(scrimPostId: number): Promise<ScrimPost | null> {
	const row = await baseFindQuery
		.select(["ScrimPost.chatRoomId"])
		.where("ScrimPost.id", "=", scrimPostId)
		.executeTakeFirst();

	if (!row) return null;

	return mapDBRowToScrimPost(row);
}

export async function findAllRelevant(): Promise<ScrimPost[]> {
	const userId = actorIdOrNull();
	const rows = await findMany();

	const mapped = rows
		.map(mapDBRowToScrimPost)
		.filter(
			(post) =>
				!Scrim.isAccepted(post) ||
				(userId && Scrim.isParticipating(post, userId)),
		);

	if (!userId) return mapped.map((post) => ({ ...post, requests: [] }));

	return mapped.map(getPostRequestCensor(userId));
}

export function acceptRequest(scrimPostRequestId: number) {
	return db.transaction().execute(async (trx) => {
		const target = await trx
			.selectFrom("ScrimPostRequest")
			.select("scrimPostId")
			.where("id", "=", scrimPostRequestId)
			.executeTakeFirstOrThrow();

		await trx
			.updateTable("ScrimPostRequest")
			.set({ isAccepted: 1 })
			.where("id", "=", scrimPostRequestId)
			.execute();

		const acceptedRequests = await trx
			.selectFrom("ScrimPostRequest")
			.select("id")
			.where("scrimPostId", "=", target.scrimPostId)
			.where("isAccepted", "=", 1)
			.execute();

		if (acceptedRequests.length > 1) {
			throw new ConcurrentModificationError(
				"Another request for this scrim post was already accepted",
			);
		}

		// the scrim is now scheduled, so its chat becomes available
		const request = await trx
			.selectFrom("ScrimPostRequest")
			.select("ScrimPostRequest.startsAt")
			.where("id", "=", scrimPostRequestId)
			.executeTakeFirstOrThrow();
		const post = await trx
			.selectFrom("ScrimPost")
			.select(["ScrimPost.chatRoomId", "ScrimPost.startsAt"])
			.where("ScrimPost.id", "=", target.scrimPostId)
			.executeTakeFirstOrThrow();

		if (post.chatRoomId === null) {
			const scrimStartsAt = databaseTimestampToDate(
				request.startsAt ?? post.startsAt,
			);
			const chatRoom = await ChatRepository.insertRoom(
				{
					type: "SCRIM",
					expiresAt: addHours(scrimStartsAt, CHAT_ROOM_LIFESPAN_HOURS),
				},
				trx,
			);
			await trx
				.updateTable("ScrimPost")
				.set({ chatRoomId: chatRoom.id })
				.where("ScrimPost.id", "=", target.scrimPostId)
				.execute();
		}
	});
}

export function deleteRequest(scrimPostRequestId: number) {
	return db
		.deleteFrom("ScrimPostRequest")
		.where("id", "=", scrimPostRequestId)
		.execute();
}

export function cancelScrim(id: number, reason: string) {
	return db.transaction().execute(async (trx) => {
		await trx
			.updateTable("ScrimPost")
			.set({
				canceledAt: databaseTimestampNow(),
				canceledByUserId: actorId(),
				cancelReason: reason,
			})
			.where("id", "=", id)
			.where("canceledAt", "is", null)
			.execute();

		const post = await trx
			.selectFrom("ScrimPost")
			.select("ScrimPost.chatRoomId")
			.where("ScrimPost.id", "=", id)
			.executeTakeFirst();

		// the scrim is not happening anymore, so its chat belongs with the past ones
		await ChatRepository.updateRoomsInactive(
			[post?.chatRoomId ?? null],
			true,
			trx,
		);
	});
}

/** Accepted scrims starting within [startTime, endTime), excluding ones created after `excludeRecentlyCreated`. */
export async function findAcceptedScrimsBetweenTwoTimestamps({
	startTime,
	endTime,
	excludeRecentlyCreated,
}: {
	startTime: Date;
	endTime: Date;
	excludeRecentlyCreated: Date;
}) {
	const rows = await baseFindQuery
		.where(bookedStartsAt, ">=", dateToDatabaseTimestamp(startTime))
		.where(bookedStartsAt, "<", dateToDatabaseTimestamp(endTime))
		.where("ScrimPost.canceledAt", "is", null)
		.where(
			"ScrimPost.createdAt",
			"<",
			dateToDatabaseTimestamp(excludeRecentlyCreated),
		)
		.execute();

	return rows.map(mapDBRowToScrimPost).filter((post) => Scrim.isAccepted(post));
}

/** Accepted, uncanceled scrims of the users whose resolved start (accepted request's time for a range post, else the post's) falls in the window; one row per participating user per scrim. */
export async function findAllAcceptedByUserIds({
	userIds,
	startsAt,
	endsAt,
}: {
	userIds: Array<number>;
	startsAt: number;
	endsAt: number;
}) {
	if (userIds.length === 0) return [];

	const resolvedStartsAt = sql<number>`coalesce("ScrimPostRequest"."startsAt", "ScrimPost"."startsAt")`;

	const acceptedInWindow = db
		.selectFrom("ScrimPost")
		.innerJoin("ScrimPostRequest", (join) =>
			join
				.onRef("ScrimPostRequest.scrimPostId", "=", "ScrimPost.id")
				.on("ScrimPostRequest.isAccepted", "=", 1),
		)
		.where("ScrimPost.canceledAt", "is", null)
		.where(resolvedStartsAt, ">=", startsAt)
		.where(resolvedStartsAt, "<=", endsAt);

	const [postSideUsers, requestSideUsers] = await Promise.all([
		acceptedInWindow
			.innerJoin("ScrimPostUser", "ScrimPostUser.scrimPostId", "ScrimPost.id")
			.select(["ScrimPostUser.userId", resolvedStartsAt.as("startsAt")])
			.where("ScrimPostUser.userId", "in", userIds)
			.execute(),
		acceptedInWindow
			.innerJoin(
				"ScrimPostRequestUser",
				"ScrimPostRequestUser.scrimPostRequestId",
				"ScrimPostRequest.id",
			)
			.select(["ScrimPostRequestUser.userId", resolvedStartsAt.as("startsAt")])
			.where("ScrimPostRequestUser.userId", "in", userIds)
			.execute(),
	]);

	return [...postSideUsers, ...requestSideUsers];
}

/**
 * Pending (unaccepted, uncanceled, future) posts and requests involving the users that overlap
 * [startTime, endTime], for auto-cleaning when a scrim is scheduled: posts come with member ids
 * for notifying, requests are deleted silently.
 */
export async function findPendingOverlapsForUsers({
	userIds,
	startTime,
	endTime,
	excludePostId,
}: {
	userIds: number[];
	/** window start, database timestamp (seconds) */
	startTime: number;
	/** window end, database timestamp (seconds) */
	endTime: number;
	excludePostId: number;
}): Promise<{
	posts: Array<{ id: number; startsAt: number; memberIds: number[] }>;
	requestIds: number[];
}> {
	if (userIds.length === 0) {
		return { posts: [], requestIds: [] };
	}

	const now = dateToDatabaseTimestamp(new Date());

	const rows = await baseFindQuery
		.where("ScrimPost.canceledAt", "is", null)
		.where("ScrimPost.startsAt", ">=", now)
		.where((eb) =>
			eb.or([
				eb.exists(
					eb
						.selectFrom("ScrimPostUser")
						.select("ScrimPostUser.scrimPostId")
						.whereRef("ScrimPostUser.scrimPostId", "=", "ScrimPost.id")
						.where("ScrimPostUser.userId", "in", userIds),
				),
				eb.exists(
					eb
						.selectFrom("ScrimPostRequest")
						.innerJoin(
							"ScrimPostRequestUser",
							"ScrimPostRequestUser.scrimPostRequestId",
							"ScrimPostRequest.id",
						)
						.select("ScrimPostRequest.scrimPostId")
						.whereRef("ScrimPostRequest.scrimPostId", "=", "ScrimPost.id")
						.where("ScrimPostRequestUser.userId", "in", userIds),
				),
			]),
		)
		.execute();

	const userIdSet = new Set(userIds);

	const posts: Array<{ id: number; startsAt: number; memberIds: number[] }> =
		[];
	const requestIds: number[] = [];

	for (const post of rows
		.map(mapDBRowToScrimPost)
		.filter((post) => !Scrim.isAccepted(post))) {
		if (post.id === excludePostId) continue;

		const postInvolvesUser = post.users.some((u) => userIdSet.has(u.id));
		const postIntervalOverlaps =
			post.startsAt <= endTime &&
			(post.rangeEndsAt ?? post.startsAt) >= startTime;
		if (postInvolvesUser && postIntervalOverlaps) {
			posts.push({
				id: post.id,
				startsAt: post.startsAt,
				memberIds: post.users.map((u) => u.id),
			});
		}

		for (const request of post.requests) {
			if (request.isAccepted) continue;
			const effectiveAt = request.startsAt ?? post.startsAt;
			const requestInvolvesUser = request.users.some((u) =>
				userIdSet.has(u.id),
			);
			if (
				requestInvolvesUser &&
				effectiveAt >= startTime &&
				effectiveAt <= endTime
			) {
				requestIds.push(request.id);
			}
		}
	}

	return { posts, requestIds };
}

export type SidebarScrim = {
	id: number;
	startsAt: number;
	opponentName: string | null;
	opponentAvatarUrl: string | null;
	/** Owner of an opponent without a team, whose avatar stands in for a team's logo. */
	opponentUser: CommonUser | null;
	status: "booked" | "looking" | "requestPending";
};

export async function findUserScrims(userId: number): Promise<SidebarScrim[]> {
	const now = dateToDatabaseTimestamp(new Date());

	const rows = await baseFindQuery
		.where("ScrimPost.canceledAt", "is", null)
		.where(bookedStartsAt, ">=", now)
		.where((eb) =>
			eb.or([
				eb.exists(
					eb
						.selectFrom("ScrimPostUser")
						.select("ScrimPostUser.scrimPostId")
						.whereRef("ScrimPostUser.scrimPostId", "=", "ScrimPost.id")
						.where("ScrimPostUser.userId", "=", userId),
				),
				eb.exists(
					eb
						.selectFrom("ScrimPostRequest")
						.innerJoin(
							"ScrimPostRequestUser",
							"ScrimPostRequestUser.scrimPostRequestId",
							"ScrimPostRequest.id",
						)
						.select("ScrimPostRequest.scrimPostId")
						.whereRef("ScrimPostRequest.scrimPostId", "=", "ScrimPost.id")
						.where("ScrimPostRequestUser.userId", "=", userId),
				),
			]),
		)
		.orderBy(bookedStartsAt, "asc")
		.execute();

	return rows
		.map(mapDBRowToScrimPost)
		.filter(
			(post) => !Scrim.isAccepted(post) || Scrim.isParticipating(post, userId),
		)
		.map((post) => {
			const isAccepted = Scrim.isAccepted(post);
			const userIsInPost = post.users.some((u) => u.id === userId);

			if (!isAccepted) {
				return {
					id: post.id,
					startsAt: post.startsAt,
					opponentName: null,
					opponentAvatarUrl: null,
					opponentUser: null,
					status: userIsInPost
						? ("looking" as const)
						: ("requestPending" as const),
				};
			}

			const opponent = userIsInPost
				? post.requests[0]
				: { team: post.team, users: post.users };
			const opponentTeam = opponent?.team;
			const opponentOwner = opponent?.users.find((u) => u.isOwner);

			return {
				id: post.id,
				startsAt: post.startsAt,
				opponentName: opponentTeam?.name ?? opponentOwner?.username ?? null,
				opponentAvatarUrl: opponentTeam?.avatarUrl ?? null,
				opponentUser: opponentTeam ? null : (opponentOwner ?? null),
				status: "booked" as const,
			};
		});
}

import { addHours, sub } from "date-fns";
import {
	type Expression,
	type ExpressionBuilder,
	type NotNull,
	type SqlBool,
	sql,
} from "kysely";
import { crud } from "~/db/crud";
import {
	defineQuery,
	type Modifier,
	mapRows,
	refine,
	sortedBy,
	unchanged,
} from "~/db/entity-query";
import type { DB, TablesInsertable } from "~/db/tables";
import * as AssociationRepository from "~/features/associations/AssociationRepository.server";
import {
	actorId,
	actorIdOrNull,
	actorIdOrNullSafe,
} from "~/features/auth/core/user.server";
import * as ChatRepository from "~/features/chat/ChatRepository.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
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
	asBoolean,
	asJson,
	commonUserJsonObject,
	commonUserSelect,
	concatUserSubmittedImagePrefix,
	jsonArrayFrom,
	jsonBuildObject,
	jsonObjectFrom,
	tournamentLogoWithDefault,
} from "~/utils/kysely.server";
import { db } from "../../db/sql";
import { invariant } from "../../utils/invariant";
import { SCRIM } from "./scrims-constants";
import type { LutiDiv } from "./scrims-types";

const CHAT_ROOM_LIFESPAN_HOURS = 24;

const MAX_TIME_RANGE_SECONDS = SCRIM.MAX_TIME_RANGE_MS / 1000;

const postTable = crud("ScrimPost");
const postUserTable = crud("ScrimPostUser");
const requestTable = crud("ScrimPostRequest");
const requestUserTable = crud("ScrimPostRequestUser");

export const { deleteById } = postTable;
export const { deleteById: deleteRequestById } = requestTable;

/**
 * Scrim posts with their team. `startsAt` is the booked start once a request is accepted. Posts
 * shown to some associations only and booked scrims are hidden unless a step lifts the guard:
 * `visibleToActor`, `involvingActor` or `includingHidden`.
 */
export const posts = defineQuery({
	root: "ScrimPost",
	select: (qb) =>
		qb.select((eb) => [
			"ScrimPost.id",
			"ScrimPost.managedByAnyone",
			bookedStartsAt(eb).as("startsAt"),
			jsonObjectFrom(
				teamOf(eb.ref("ScrimPost.teamId")).$narrowType<{
					customUrl: NotNull;
				}>(),
			).as("team"),
		]),
	defaultSort: [["ScrimPost.startsAt", "asc"]],
	guards: {
		hidden: (qb) =>
			qb.where((eb) =>
				eb.and([
					eb.not(isBooked(eb)),
					AssociationRepository.isPublic(eb, eb.ref("ScrimPost.visibility")),
				]),
			),
	},
	vocabulary: ({ lift }) => ({
		/** The actor's scrims plus the posts not booked yet that are currently shown to them. */
		visibleToActor: () =>
			lift("hidden", (qb) =>
				qb.where((eb) => {
					const viewerId = actorIdOrNull();
					const browsable = eb.and([
						eb.not(isBooked(eb)),
						AssociationRepository.isVisibleToActor(eb, {
							visibility: eb.ref("ScrimPost.visibility"),
							contentOwnerId: ownerIdOf(eb),
						}),
					]);

					return viewerId === null
						? browsable
						: eb.or([participatedBy(eb, [viewerId]), browsable]);
				}),
			),
		/** The posts the actor takes part in, see {@link participatedBy}. */
		involvingActor: () =>
			lift("hidden", (qb) => qb.where((eb) => participatedBy(eb, [actorId()]))),
		/** Posts any of the users takes part in, see {@link participatedBy}. */
		involvingAnyOf: (userIds: number[]) =>
			refine("ScrimPost", (qb) =>
				qb.where((eb) => participatedBy(eb, userIds)),
			),
		/** Every post regardless of who it is shown to, for internal jobs and pages checking access themselves. */
		includingHidden: () => lift("hidden"),
		/**
		 * The users of the post and the requests to it the actor may see: the accepted one once
		 * booked, before that every request for the post's users and their own for the rest.
		 * Without an actor (routines) only the accepted request.
		 */
		withParticipants: ({ cards = false }: { cards?: boolean } = {}) =>
			participants({ cards }),
		/**
		 * Posts shown to the association at any point of their schedule. The actor's own posts and
		 * booked scrims stay, as the filter only narrows what is browsed.
		 */
		forAssociation: (associationId: number | null) =>
			associationId === null
				? unchanged("ScrimPost")
				: refine("ScrimPost", (qb) =>
						qb.where((eb) => {
							const viewerId = actorIdOrNull();

							return eb.or([
								AssociationRepository.mentionsAssociation(eb, {
									visibility: eb.ref("ScrimPost.visibility"),
									associationId,
								}),
								isBooked(eb),
								...(viewerId === null
									? []
									: [
											eb.exists(
												eb
													.selectFrom("ScrimPostUser")
													.select("ScrimPostUser.userId")
													.whereRef(
														"ScrimPostUser.scrimPostId",
														"=",
														"ScrimPost.id",
													)
													.where("ScrimPostUser.userId", "=", viewerId),
											),
										]),
							]);
						}),
					),
		/** Posts whose start (the booked one once booked) is at `date` or later. */
		startingFrom: (date: Date) =>
			refine("ScrimPost", (qb) => {
				const timestamp = dateToDatabaseTimestamp(date);

				// a booked start is at most the post's flexibility after its own start, which lets the index narrow the scan
				return qb
					.where("ScrimPost.startsAt", ">=", timestamp - MAX_TIME_RANGE_SECONDS)
					.where((eb) => eb(bookedStartsAt(eb), ">=", timestamp));
			}),
		/** Posts whose start (the booked one once booked) is before `date`. */
		startingBefore: (date: Date) =>
			refine("ScrimPost", (qb) => {
				const timestamp = dateToDatabaseTimestamp(date);

				return qb
					.where("ScrimPost.startsAt", "<", timestamp)
					.where((eb) => eb(bookedStartsAt(eb), "<", timestamp));
			}),
		/** Posts with an accepted request. */
		booked: () => refine("ScrimPost", (qb) => qb.where(isBooked)),
		soonestFirst: () => sortedBy("ScrimPost", [bookedStartsAt, "asc"]),
		/**
		 * What the post's card on the scrims page shows. `rangeEndsAt` is `null` once booked,
		 * `isPrivate` whether the post is currently shown to some associations only.
		 */
		withListingDetails: () =>
			refine("ScrimPost", (qb) =>
				qb.select((eb) => [
					"ScrimPost.createdAt",
					"ScrimPost.text",
					"ScrimPost.maps",
					"ScrimPost.isScheduledForFuture",
					sql<
						number | null
					>`iif(${isBooked(eb)}, null, ${eb.ref("ScrimPost.rangeEndsAt")})`.as(
						"rangeEndsAt",
					),
					asBoolean(
						eb.not(
							AssociationRepository.isPublic(
								eb,
								eb.ref("ScrimPost.visibility"),
							),
						),
					).as("isPrivate"),
					asJson(
						sql<{
							max: LutiDiv;
							min: LutiDiv;
						} | null>`iif(${eb.ref("ScrimPost.maxDiv")} is not null and ${eb.ref("ScrimPost.minDiv")} is not null, ${jsonBuildObject(
							{
								max: lutiDiv(eb.ref("ScrimPost.maxDiv")),
								min: lutiDiv(eb.ref("ScrimPost.minDiv")),
							},
						)}, null)`,
					).as("divs"),
				]),
			),
		/** The tournament whose map pool the post uses, `null` for none. */
		withMapsTournament: () =>
			refine("ScrimPost", (qb) =>
				qb.select((eb) =>
					jsonObjectFrom(
						eb
							.selectFrom("CalendarEvent")
							.select((eventEb) => [
								"CalendarEvent.tournamentId as id",
								"CalendarEvent.name",
								tournamentLogoWithDefault(eventEb).as("avatarUrl"),
							])
							.whereRef(
								"CalendarEvent.tournamentId",
								"=",
								"ScrimPost.mapsTournamentId",
							)
							.$narrowType<{ id: NotNull }>(),
					).as("mapsTournament"),
				),
			),
		/** When, why and by whom the scrim was canceled, `null` when it wasn't. */
		withCancellation: () =>
			refine("ScrimPost", (qb) =>
				qb.select((eb) =>
					jsonObjectFrom(
						eb
							.selectFrom("User")
							.select((userEb) => [
								eb.ref("ScrimPost.canceledAt").as("at"),
								eb.ref("ScrimPost.cancelReason").as("reason"),
								commonUserJsonObject(userEb).as("byUser"),
							])
							.whereRef("User.id", "=", "ScrimPost.canceledByUserId")
							.where("ScrimPost.canceledAt", "is not", null)
							.where("ScrimPost.cancelReason", "is not", null)
							.$narrowType<{ at: NotNull; reason: NotNull }>(),
					).as("canceled"),
				),
			),
		/**
		 * Who may manage the post (its owners, or all its users when it is managed by anyone),
		 * delete it, cancel the scrim (also the accepted request's users) and track its maps (both
		 * sides of a booked scrim). A request's users may cancel it.
		 */
		withPermissions: () =>
			mapRows(
				"ScrimPost",
				(row: {
					managedByAnyone: boolean;
					users: Array<{ id: number; isOwner: boolean }>;
					requests: Array<ParticipantsRow["requests"][number]>;
				}) => {
					const userIds = row.users.map((user) => user.id);
					const managerIds = row.managedByAnyone
						? userIds
						: row.users.filter((user) => user.isOwner).map((user) => user.id);
					const acceptedRequestUserIds =
						row.requests
							.find((request) => request.isAccepted)
							?.users.map((user) => user.id) ?? null;

					return {
						permissions: {
							MANAGE_REQUESTS: managerIds,
							DELETE_POST: managerIds,
							CANCEL: [...managerIds, ...(acceptedRequestUserIds ?? [])],
							MANAGE_TRACKING: acceptedRequestUserIds
								? [...userIds, ...acceptedRequestUserIds]
								: [],
						},
						requests: row.requests.map((request) => ({
							...request,
							permissions: { CANCEL: request.users.map((user) => user.id) },
						})),
					};
				},
			),
	}),
});

/** The post as its page shows it, hidden ones included: the scrim page checks access itself. */
export function postById(id: number) {
	return posts()
		.where({ id })
		.includingHidden()
		.withColumns(["chatRoomId"])
		.withMapsTournament()
		.withCancellation()
		.withParticipants()
		.withPermissions();
}

/**
 * The posts the scrims page lists, with the viewer's and the participants' user cards. An
 * association filter narrows only what is browsed.
 */
export function listedPosts(associationId: number | null) {
	return posts()
		.visibleToActor()
		.startingFrom(sub(new Date(), { hours: SCRIM.LISTED_HOURS_AFTER_START }))
		.forAssociation(associationId)
		.soonestFirst()
		.withListingDetails()
		.withMapsTournament()
		.withCancellation()
		.withParticipants({ cards: true })
		.withPermissions();
}

/** The actor's upcoming scrims that aren't canceled, booked or still looking for an opponent, soonest first. */
export function ownUpcoming() {
	return posts()
		.involvingActor()
		.where({ canceledAt: null })
		.startingFrom(new Date())
		.soonestFirst()
		.withParticipants();
}

type InsertArgs = Omit<
	TablesInsertable["ScrimPost"],
	"chatRoomId" | "canceledAt" | "canceledByUserId" | "cancelReason"
> & {
	/** users related to the post other than the author */
	users: Array<Pick<TablesInsertable["ScrimPostUser"], "userId" | "isOwner">>;
};

export function insert(args: InsertArgs) {
	if (args.users.length === 0) {
		throw new Error("At least one user must be provided");
	}

	const { users, ...post } = args;

	return db.transaction().execute(async (trx) => {
		const { id } = await postTable.insert(post, trx);

		await postUserTable.insertMany(
			users.map((user) => ({ ...user, scrimPostId: id })),
			trx,
		);

		return id;
	});
}

type InsertRequestArgs = Pick<
	TablesInsertable["ScrimPostRequest"],
	"scrimPostId" | "teamId" | "message" | "startsAt"
> & {
	users: Array<
		Pick<TablesInsertable["ScrimPostRequestUser"], "userId" | "isOwner">
	>;
};

/** Inserts a request to a scrim post, returning its id. @throws {DuplicateEntryError} if the team already has one for the post. */
export function insertRequest(args: InsertRequestArgs) {
	invariant(args.users.length > 0, "At least one user must be provided");

	const { users, ...request } = args;

	return db.transaction().execute(async (trx) => {
		if (
			typeof request.teamId === "number" &&
			(await requestTable.exists(
				{ scrimPostId: request.scrimPostId, teamId: request.teamId },
				trx,
			))
		) {
			throw new DuplicateEntryError(
				"Team already has a request for this scrim post",
			);
		}

		const { id } = await requestTable.insert(request, trx);

		await requestUserTable.insertMany(
			users.map((user) => ({ ...user, scrimPostRequestId: id })),
			trx,
		);

		return id;
	});
}

/**
 * Books the scrim with the request and opens its chat room. @throws {ConcurrentModificationError}
 * if another request for the post was accepted first.
 */
export function acceptRequest(scrimPostRequestId: number) {
	return db.transaction().execute(async (trx) => {
		const request = await requestTable.findById(scrimPostRequestId, trx);
		invariant(request, "Scrim post request not found");

		await requestTable.updateById(
			scrimPostRequestId,
			{ isAccepted: true },
			trx,
		);

		const acceptedCount = await requestTable.count(
			{ scrimPostId: request.scrimPostId, isAccepted: true },
			trx,
		);
		if (acceptedCount > 1) {
			throw new ConcurrentModificationError(
				"Another request for this scrim post was already accepted",
			);
		}

		// the scrim is now scheduled, so its chat becomes available
		const post = await postTable.findById(request.scrimPostId, trx);
		invariant(post, "Scrim post not found");

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
			await postTable.updateById(post.id, { chatRoomId: chatRoom.id }, trx);
		}
	});
}

/** Cancels the booked scrim, filling `canceledByUserId` with the actor. */
export function cancelScrim(id: number, reason: string) {
	return db.transaction().execute(async (trx) => {
		await postTable.update(
			{ id, canceledAt: null },
			{
				canceledAt: databaseTimestampNow(),
				canceledByUserId: actorId(),
				cancelReason: reason,
			},
			trx,
		);

		const post = await postTable.findById(id, trx);

		// the scrim is not happening anymore, so its chat belongs with the past ones
		await ChatRepository.updateRoomsInactive(
			[post?.chatRoomId ?? null],
			true,
			trx,
		);
	});
}

/**
 * Pending (not booked, uncanceled, future) posts of the users and their pending requests that
 * overlap [startTime, endTime], for clearing them out when a scrim is booked: posts come with
 * member ids for notifying, requests are deleted silently.
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
}) {
	if (userIds.length === 0) {
		return { posts: [], requestIds: [] };
	}

	const pendingPosts = db
		.selectFrom("ScrimPost")
		.where("ScrimPost.id", "!=", excludePostId)
		.where("ScrimPost.canceledAt", "is", null)
		.where("ScrimPost.startsAt", ">=", databaseTimestampNow())
		.where((eb) => eb.not(isBooked(eb)));

	const overlappingPosts = await pendingPosts
		.select((eb) => [
			"ScrimPost.id",
			"ScrimPost.startsAt",
			jsonArrayFrom(
				eb
					.selectFrom("ScrimPostUser")
					.select("ScrimPostUser.userId")
					.whereRef("ScrimPostUser.scrimPostId", "=", "ScrimPost.id"),
			).as("members"),
		])
		.where("ScrimPost.startsAt", "<=", endTime)
		.where(
			(eb) => eb.fn.coalesce("ScrimPost.rangeEndsAt", "ScrimPost.startsAt"),
			">=",
			startTime,
		)
		.where("ScrimPost.id", "in", (eb) =>
			eb
				.selectFrom("ScrimPostUser")
				.select("ScrimPostUser.scrimPostId")
				.where("ScrimPostUser.userId", "in", userIds),
		)
		.execute();

	const overlappingRequests = await pendingPosts
		.innerJoin(
			"ScrimPostRequest",
			"ScrimPostRequest.scrimPostId",
			"ScrimPost.id",
		)
		.select("ScrimPostRequest.id")
		.where(
			(eb) => eb.fn.coalesce("ScrimPostRequest.startsAt", "ScrimPost.startsAt"),
			">=",
			startTime,
		)
		.where(
			(eb) => eb.fn.coalesce("ScrimPostRequest.startsAt", "ScrimPost.startsAt"),
			"<=",
			endTime,
		)
		.where("ScrimPostRequest.id", "in", (eb) =>
			eb
				.selectFrom("ScrimPostRequestUser")
				.select("ScrimPostRequestUser.scrimPostRequestId")
				.where("ScrimPostRequestUser.userId", "in", userIds),
		)
		.execute();

	return {
		posts: overlappingPosts.map((post) => ({
			id: post.id,
			startsAt: post.startsAt,
			memberIds: post.members.map((member) => member.userId),
		})),
		requestIds: overlappingRequests.map((request) => request.id),
	};
}

type ParticipantsRow =
	ReturnType<typeof participants> extends Modifier<"ScrimPost", infer Added>
		? Added
		: never;

function participants({ cards }: { cards: boolean }) {
	return refine("ScrimPost", (qb) =>
		qb.select((eb) => {
			const viewerId = actorIdOrNullSafe();

			return [
				jsonArrayFrom(
					eb
						.selectFrom("ScrimPostUser")
						.innerJoin("User", "User.id", "ScrimPostUser.userId")
						.select((userEb) => [
							...commonUserSelect(userEb),
							"User.inGameName",
							"ScrimPostUser.isOwner",
						])
						.$if(cards, (userQb) =>
							userQb.select((userEb) =>
								UserCardRepository.cardOf(userEb.ref("User.id")).as("card"),
							),
						)
						.whereRef("ScrimPostUser.scrimPostId", "=", "ScrimPost.id"),
				).as("users"),
				jsonArrayFrom(
					eb
						.selectFrom("ScrimPostRequest")
						.select((requestEb) => [
							"ScrimPostRequest.id",
							"ScrimPostRequest.isAccepted",
							"ScrimPostRequest.createdAt",
							"ScrimPostRequest.message",
							"ScrimPostRequest.startsAt",
							jsonObjectFrom(
								teamOf(requestEb.ref("ScrimPostRequest.teamId")).$narrowType<{
									customUrl: NotNull;
								}>(),
							).as("team"),
							jsonArrayFrom(
								requestEb
									.selectFrom("ScrimPostRequestUser")
									.innerJoin("User", "User.id", "ScrimPostRequestUser.userId")
									.select((userEb) => [
										...commonUserSelect(userEb),
										"User.inGameName",
										"ScrimPostRequestUser.isOwner",
									])
									.$if(cards, (userQb) =>
										userQb.select((userEb) =>
											UserCardRepository.cardOf(userEb.ref("User.id")).as(
												"card",
											),
										),
									)
									.whereRef(
										"ScrimPostRequestUser.scrimPostRequestId",
										"=",
										"ScrimPostRequest.id",
									),
							).as("users"),
						])
						.whereRef("ScrimPostRequest.scrimPostId", "=", "ScrimPost.id")
						.where((requestEb) =>
							requestEb.or([
								requestEb("ScrimPostRequest.isAccepted", "=", true),
								...(viewerId === null
									? []
									: [
											requestEb.and([
												requestEb.not(isBooked(eb)),
												requestEb.or([
													requestEb.exists(
														requestEb
															.selectFrom("ScrimPostUser")
															.select("ScrimPostUser.userId")
															.whereRef(
																"ScrimPostUser.scrimPostId",
																"=",
																"ScrimPost.id",
															)
															.where("ScrimPostUser.userId", "=", viewerId),
													),
													requestEb.exists(
														requestEb
															.selectFrom("ScrimPostRequestUser")
															.select("ScrimPostRequestUser.userId")
															.whereRef(
																"ScrimPostRequestUser.scrimPostRequestId",
																"=",
																"ScrimPostRequest.id",
															)
															.where(
																"ScrimPostRequestUser.userId",
																"=",
																viewerId,
															),
													),
												]),
											]),
										]),
							]),
						)
						.orderBy("ScrimPostRequest.id", "asc"),
				).as("requests"),
			];
		}),
	);
}

function isBooked(eb: ExpressionBuilder<DB, "ScrimPost">) {
	return eb.exists(
		eb
			.selectFrom("ScrimPostRequest")
			.select("ScrimPostRequest.id")
			.whereRef("ScrimPostRequest.scrimPostId", "=", "ScrimPost.id")
			.where("ScrimPostRequest.isAccepted", "=", true),
	);
}

/** The accepted request's chosen time for a range post, the post's own start otherwise. */
function bookedStartsAt(eb: ExpressionBuilder<DB, "ScrimPost">) {
	return eb.fn.coalesce(
		eb
			.selectFrom("ScrimPostRequest")
			.select("ScrimPostRequest.startsAt")
			.whereRef("ScrimPostRequest.scrimPostId", "=", "ScrimPost.id")
			.where("ScrimPostRequest.isAccepted", "=", true)
			.limit(1)
			.$asScalar(),
		eb.ref("ScrimPost.startsAt"),
	);
}

/**
 * Whether any of the users takes part in the post: one of its users, or of a request to it that
 * is accepted or made while it isn't booked yet. A request passed over for another is not.
 */
function participatedBy(
	eb: ExpressionBuilder<DB, "ScrimPost">,
	userIds: number[],
): Expression<SqlBool> {
	// not correlated to the post, so SQLite builds the id list once per query
	return eb(
		"ScrimPost.id",
		"in",
		eb
			.selectFrom("ScrimPostUser")
			.select("ScrimPostUser.scrimPostId")
			.where("ScrimPostUser.userId", "in", userIds)
			.union(
				eb
					.selectFrom("ScrimPostRequestUser")
					.innerJoin(
						"ScrimPostRequest",
						"ScrimPostRequest.id",
						"ScrimPostRequestUser.scrimPostRequestId",
					)
					.select("ScrimPostRequest.scrimPostId")
					.where("ScrimPostRequestUser.userId", "in", userIds)
					.where((requestEb) =>
						requestEb.or([
							requestEb("ScrimPostRequest.isAccepted", "=", true),
							requestEb.not(
								requestEb.exists(
									requestEb
										.selectFrom("ScrimPostRequest as AcceptedRequest")
										.select("AcceptedRequest.id")
										.whereRef(
											"AcceptedRequest.scrimPostId",
											"=",
											"ScrimPostRequest.scrimPostId",
										)
										.where("AcceptedRequest.isAccepted", "=", true),
								),
							),
						]),
					),
			),
	);
}

function ownerIdOf(eb: ExpressionBuilder<DB, "ScrimPost">) {
	return eb
		.selectFrom("ScrimPostUser")
		.select("ScrimPostUser.userId")
		.whereRef("ScrimPostUser.scrimPostId", "=", "ScrimPost.id")
		.where("ScrimPostUser.isOwner", "=", true)
		.limit(1)
		.$asScalar();
}

/** The team's card fields, `null` once the team is deleted. Correlated through `teamId`, so it works under any root. */
function teamOf(teamId: Expression<number | null>) {
	return db
		.selectFrom("Team")
		.leftJoin("UserSubmittedImage", "UserSubmittedImage.id", "Team.avatarImgId")
		.select((teamEb) => [
			"Team.name",
			"Team.customUrl",
			concatUserSubmittedImagePrefix(teamEb.ref("UserSubmittedImage.url")).as(
				"avatarUrl",
			),
		])
		.where("Team.id", "=", teamId)
		.where("Team.deletedAt", "is", null);
}

/** The division stored as a number as it is shown, 0 being "X". */
function lutiDiv(div: Expression<number | null>) {
	// raw, as Kysely can't infer the division names from the numbers
	return sql<LutiDiv>`iif(${div} = 0, 'X', cast(${div} as text))`;
}

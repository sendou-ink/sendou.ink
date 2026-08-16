import type { Unwrapped } from "@sendou/utils/types";
import { db } from "#lib/server/db/sql.ts";
import {
	type CommonUser,
	commonUserSelect,
	concatUserSubmittedImagePrefix,
	jsonArrayFrom,
	jsonBuildObject,
	tournamentLogoWithDefault,
} from "#lib/server/kysely.ts";
import { dateToDatabaseTimestamp } from "#lib/utils/dates.ts";
import * as Scrim from "./Scrim.ts";
import type { ScrimPost, ScrimPostUser } from "./scrims-types.ts";

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

type BaseFindRow = Unwrapped<typeof findManyForRowType>;

function findManyForRowType() {
	return baseFindQuery.execute();
}

const mapDBRowToScrimPost = (
	row: BaseFindRow & { chatCode?: string },
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
				? {
						max: Scrim.parseLutiDiv(row.maxDiv),
						min: Scrim.parseLutiDiv(row.minDiv),
					}
				: null,
		maps: row.maps,
		mapsTournament: row.mapsTournament.id
			? {
					id: row.mapsTournament.id,
					name: row.mapsTournament.name!,
					avatarUrl: row.mapsTournament.avatarUrl,
				}
			: null,
		chatCode: row.chatCode ?? null,
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

export type SidebarScrim = {
	id: number;
	startsAt: number;
	opponentName: string | null;
	opponentAvatarUrl: string | null;
	/** Owner of an opponent without a team, whose avatar stands in for a team's logo. */
	opponentUser: CommonUser | null;
	status: "booked" | "looking" | "requestPending";
};

/** The user's upcoming scrims (and pending scrim requests) for the sidebar events list. */
export async function findUserScrims(userId: number): Promise<SidebarScrim[]> {
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
		.orderBy("ScrimPost.startsAt", "asc")
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

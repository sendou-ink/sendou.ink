import { sub } from "date-fns";
import type { Insertable } from "kysely";
import { jsonArrayFrom, jsonBuildObject } from "kysely/helpers/sqlite";
import type { Tables, TablesInsertable } from "~/db/tables";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import { COMMON_USER_FIELDS } from "~/utils/kysely.server";
import { db } from "../../db/sql";
import invariant from "../../utils/invariant";
import type { Unwrapped } from "../../utils/types";
import type { AssociationVisibility } from "../associations/associations-types";
import * as Scrim from "./core/Scrim";
import type { ScrimPost, ScrimPostUser } from "./scrims-types";
import { getPostRequestCensor, parseLutiDiv } from "./scrims-utils";

type InsertArgs = Pick<
	TablesInsertable["ScrimPost"],
	"at" | "maxDiv" | "minDiv" | "teamId" | "text"
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
				at: args.at,
				maxDiv: args.maxDiv,
				minDiv: args.minDiv,
				teamId: args.teamId,
				text: args.text,
				visibility: args.visibility ? JSON.stringify(args.visibility) : null,
				chatCode: shortNanoid(),
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
	"scrimPostId" | "teamId"
> & {
	users: Array<
		Pick<Insertable<Tables["ScrimPostRequestUser"]>, "userId" | "isOwner">
	>;
};

export function insertRequest(args: InsertRequestArgs) {
	invariant(args.users.length > 0, "At least one user must be provided");

	return db.transaction().execute(async (trx) => {
		const newRequest = await trx
			.insertInto("ScrimPostRequest")
			.values({
				scrimPostId: args.scrimPostId,
				teamId: args.teamId,
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
	});
}

export function del(scrimPostId: number) {
	return db.deleteFrom("ScrimPost").where("id", "=", scrimPostId).execute();
}

const baseFindQuery = db
	.selectFrom("ScrimPost")
	.leftJoin("Team", "ScrimPost.teamId", "Team.id")
	.leftJoin("UserSubmittedImage", "Team.avatarImgId", "UserSubmittedImage.id")
	.select((eb) => [
		"ScrimPost.id",
		"ScrimPost.at",
		"ScrimPost.visibility",
		"ScrimPost.maxDiv",
		"ScrimPost.minDiv",
		"ScrimPost.text",
		"ScrimPost.managedByAnyone",
		"ScrimPost.canceledAt",
		"ScrimPost.canceledByUserId",
		"ScrimPost.cancelReason",
		"ScrimPost.isScheduledForFuture",
		jsonBuildObject({
			name: eb.ref("Team.name"),
			customUrl: eb.ref("Team.customUrl"),
			avatarUrl: eb.ref("UserSubmittedImage.url"),
		}).as("team"),
		jsonArrayFrom(
			eb
				.selectFrom("ScrimPostUser")
				.innerJoin("User", "ScrimPostUser.userId", "User.id")
				.select([...COMMON_USER_FIELDS, "ScrimPostUser.isOwner"])
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
					jsonBuildObject({
						name: innerEb.ref("Team.name"),
						customUrl: innerEb.ref("Team.customUrl"),
						avatarUrl: innerEb.ref("UserSubmittedImage.url"),
					}).as("team"),
					jsonArrayFrom(
						innerEb
							.selectFrom("ScrimPostRequestUser")
							.innerJoin("User", "ScrimPostRequestUser.userId", "User.id")
							.select([...COMMON_USER_FIELDS, "ScrimPostRequestUser.isOwner"])
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

function findMany() {
	const min = sub(new Date(), { hours: 3 });

	return baseFindQuery
		.orderBy("at", "asc")
		.where("ScrimPost.at", ">=", dateToDatabaseTimestamp(min))
		.execute();
}

const mapDBRowToScrimPost = (
	row: Unwrapped<typeof findMany> & { chatCode?: string },
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

	return {
		id: row.id,
		at: row.at,
		visibility: row.visibility,
		text: row.text,
		isScheduledForFuture: Boolean(row.isScheduledForFuture),
		divs:
			typeof row.maxDiv === "number" && typeof row.minDiv === "number"
				? { max: parseLutiDiv(row.maxDiv), min: parseLutiDiv(row.minDiv) }
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
		},
		managedByAnyone: Boolean(row.managedByAnyone),
		canceled,
	};
};

export async function findById(scrimPostId: number): Promise<ScrimPost | null> {
	const row = await baseFindQuery
		.select(["ScrimPost.chatCode"])
		.where("ScrimPost.id", "=", scrimPostId)
		.executeTakeFirst();

	if (!row) return null;

	return mapDBRowToScrimPost(row);
}

export async function findAllRelevant(userId?: number): Promise<ScrimPost[]> {
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
	return db
		.updateTable("ScrimPostRequest")
		.set({ isAccepted: 1 })
		.where("id", "=", scrimPostRequestId)
		.execute();
}

export function deleteRequest(scrimPostRequestId: number) {
	return db
		.deleteFrom("ScrimPostRequest")
		.where("id", "=", scrimPostRequestId)
		.execute();
}

export async function cancelScrim(
	id: number,
	{ userId, reason }: { userId: number; reason: string },
) {
	await db
		.updateTable("ScrimPost")
		.set({
			canceledAt: databaseTimestampNow(),
			canceledByUserId: userId,
			cancelReason: reason,
		})
		.where("id", "=", id)
		.where("canceledAt", "is", null)
		.execute();
}

import { sub } from "date-fns";
import type { Insertable } from "kysely";
import { jsonArrayFrom, jsonBuildObject } from "kysely/helpers/sqlite";
import { nanoid } from "nanoid";
import type { Tables } from "~/db/tables";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { COMMON_USER_FIELDS } from "~/utils/kysely.server";
import { INVITE_CODE_LENGTH } from "../../constants";
import { db } from "../../db/sql";
import invariant from "../../utils/invariant";
import type { Unwrapped } from "../../utils/types";
import * as ScrimPost from "./core/ScrimPost";
import type { ScrimPost as ScrimPostType } from "./scrims-types";
import { getPostRequestCensor, parseLutiDiv } from "./scrims-utils";

type InsertArgs = Pick<
	Insertable<Tables["ScrimPost"]>,
	"at" | "maxDiv" | "minDiv" | "teamId" | "text" | "visibility"
> & {
	/** users related to the post other than the author */
	users: Array<Pick<Insertable<Tables["ScrimPostUser"]>, "userId" | "isOwner">>;
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
				visibility: args.visibility,
				chatCode: nanoid(INVITE_CODE_LENGTH),
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("ScrimPostUser")
			.values(args.users.map((user) => ({ ...user, scrimPostId: newPost.id })))
			.execute();
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
		"ScrimPost.maxDiv",
		"ScrimPost.minDiv",
		"ScrimPost.text",
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
): ScrimPostType => {
	const someRequestIsAccepted = row.requests.some(
		(request) => request.isAccepted,
	);

	// once one is accepted, rest are not relevant
	const requests = someRequestIsAccepted
		? row.requests.filter((request) => request.isAccepted)
		: row.requests;

	return {
		id: row.id,
		at: row.at,
		text: row.text,
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
				users: request.users.map((user) => {
					return {
						...user,
						isVerified: false,
						isOwner: Boolean(user.isOwner),
					};
				}),
			};
		}),
		users: row.users.map((user) => {
			return {
				...user,
				isVerified: false,
				isOwner: Boolean(user.isOwner),
			};
		}),
	};
};

export async function findById(
	scrimPostId: number,
): Promise<ScrimPostType | null> {
	const row = await baseFindQuery
		.select(["ScrimPost.chatCode"])
		.where("ScrimPost.id", "=", scrimPostId)
		.executeTakeFirst();

	if (!row) return null;

	return mapDBRowToScrimPost(row);
}

export async function findAllRelevant(
	userId?: number,
): Promise<ScrimPostType[]> {
	const rows = await findMany();

	const mapped = rows
		.map(mapDBRowToScrimPost)
		.filter(
			(post) =>
				!ScrimPost.isAccepted(post) ||
				(userId && ScrimPost.isParticipating(post, userId)),
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

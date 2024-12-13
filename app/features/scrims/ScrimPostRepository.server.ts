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
import type { LutiDiv, ScrimPost } from "./scrims-types";
import { getPostRequestCensor } from "./scrims-utils";

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

const parseLutiDiv = (div: number): LutiDiv => {
	if (div === 0) return "X";

	return String(div) as LutiDiv;
};

export async function findAllRelevant(userId?: number): Promise<ScrimPost[]> {
	const min = sub(new Date(), { hours: 2 });

	const rows = await db
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
					.leftJoin("Team", "ScrimPost.teamId", "Team.id")
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
		])
		.orderBy("at", "asc")
		.where("ScrimPost.at", ">=", dateToDatabaseTimestamp(min))
		.execute();

	const mapped = rows.map((row) => {
		return {
			id: row.id,
			at: row.at,
			text: row.text,
			divs:
				typeof row.maxDiv === "number" && typeof row.minDiv === "number"
					? { max: parseLutiDiv(row.maxDiv), min: parseLutiDiv(row.minDiv) }
					: null,
			chatCode: null,
			team: row.team.name
				? {
						name: row.team.name,
						customUrl: row.team.customUrl!,
						avatarUrl: row.team.avatarUrl,
					}
				: null,
			requests: row.requests.map((request) => {
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
	});

	if (!userId) return mapped.map((post) => ({ ...post, requests: [] }));

	return mapped.map(getPostRequestCensor(userId));
}

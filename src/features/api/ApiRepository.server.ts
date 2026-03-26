import { nanoid } from "nanoid";
import { db } from "~/db/sql";
import type { ApiTokenType } from "~/db/tables";

const API_TOKEN_LENGTH = 20;

/** Finds an API token for the given user ID and type. */
export function findTokenByUserId(userId: number, type: ApiTokenType) {
	return db
		.selectFrom("ApiToken")
		.selectAll()
		.where("userId", "=", userId)
		.where("type", "=", type)
		.executeTakeFirst();
}

/** Generates a new API token for the given user. Deletes any existing token of the same type before creating a new one. */
export function generateToken(userId: number, type: ApiTokenType) {
	const token = nanoid(API_TOKEN_LENGTH);

	return db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("ApiToken")
			.where("userId", "=", userId)
			.where("type", "=", type)
			.execute();

		return trx
			.insertInto("ApiToken")
			.values({
				userId,
				token,
				type,
			})
			.returning("token")
			.executeTakeFirstOrThrow();
	});
}

/** Retrieves all valid API tokens and their types from users with API access. */
export async function allApiTokens() {
	const tokens = await db
		.selectFrom("ApiToken")
		.innerJoin("User", "User.id", "ApiToken.userId")
		.leftJoin(
			"TournamentOrganizationMember",
			"TournamentOrganizationMember.userId",
			"ApiToken.userId",
		)
		.leftJoin(
			"TournamentOrganization",
			"TournamentOrganization.id",
			"TournamentOrganizationMember.organizationId",
		)
		.select(["ApiToken.token", "ApiToken.type", "ApiToken.userId"])
		// NOTE: permissions logic also exists in checkUserHasApiAccess function
		.where((eb) =>
			eb.or([
				eb("User.isApiAccesser", "=", 1),
				eb("User.isTournamentOrganizer", "=", 1),
				eb("User.patronTier", ">=", 2),
				eb.and([
					eb("TournamentOrganization.isEstablished", "=", 1),
					eb.or([
						eb("TournamentOrganizationMember.role", "=", "ADMIN"),
						eb("TournamentOrganizationMember.role", "=", "ORGANIZER"),
						eb("TournamentOrganizationMember.role", "=", "STREAMER"),
					]),
				]),
			]),
		)
		.groupBy("ApiToken.token")
		.execute();

	return tokens.map((row) => ({
		token: row.token,
		type: row.type,
		userId: row.userId,
	}));
}

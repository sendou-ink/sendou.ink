import { nanoid } from "nanoid";
import { db } from "~/db/sql";

const API_TOKEN_LENGTH = 20;

/**
 * Finds an API token for the given user ID.
 * @returns API token record if found, undefined otherwise
 */
export function findTokenByUserId(userId: number) {
	return db
		.selectFrom("ApiToken")
		.selectAll()
		.where("userId", "=", userId)
		.executeTakeFirst();
}

/**
 * Generates a new API token for the given user.
 * Deletes any existing token for the user before creating a new one.
 * @returns Object containing the newly generated token
 */
export function generateToken(userId: number) {
	const token = nanoid(API_TOKEN_LENGTH);

	return db.transaction().execute(async (trx) => {
		await trx.deleteFrom("ApiToken").where("userId", "=", userId).execute();

		return trx
			.insertInto("ApiToken")
			.values({
				userId,
				token,
			})
			.returning("token")
			.executeTakeFirstOrThrow();
	});
}

/**
 * Retrieves all valid API tokens from users with API access.
 * Includes tokens from users with the isApiAccesser flag enabled (includes supporters),
 * or users who are ADMIN, ORGANIZER, or STREAMER members of established tournament organizations.
 * @returns Array of valid API token strings
 */
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
		.select("ApiToken.token")
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

	return tokens.map((row) => row.token);
}

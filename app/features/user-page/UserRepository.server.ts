import type { ExpressionBuilder, FunctionModule, NotNull } from "kysely";
import { sql } from "kysely";
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";
import { db, sql as dbDirect } from "~/db/sql";
import type {
	BuildSort,
	DB,
	TablesInsertable,
	UserPreferences,
} from "~/db/tables";
import type { User } from "~/db/types";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import type { CommonUser } from "~/utils/kysely.server";
import { COMMON_USER_FIELDS } from "~/utils/kysely.server";
import { safeNumberParse } from "~/utils/number";

const identifierToUserIdQuery = (identifier: string) =>
	db
		.selectFrom("User")
		.select("User.id")
		.where((eb) => {
			// we don't want to parse discord id's as numbers (length = 18)
			const parsedId =
				identifier.length < 10 ? safeNumberParse(identifier) : null;
			if (parsedId) {
				return eb("User.id", "=", parsedId);
			}

			if (/^\d+$/.test(identifier)) {
				return eb("User.discordId", "=", identifier);
			}

			return eb("User.customUrl", "=", identifier);
		});

export function identifierToUserId(identifier: string) {
	return identifierToUserIdQuery(identifier).executeTakeFirst();
}

export async function identifierToBuildFields(identifier: string) {
	const row = await identifierToUserIdQuery(identifier)
		.select(({ eb }) => [
			"User.buildSorting",
			jsonArrayFrom(
				eb
					.selectFrom("UserWeapon")
					.select("UserWeapon.weaponSplId")
					.whereRef("UserWeapon.userId", "=", "User.id")
					.orderBy("UserWeapon.order", "asc"),
			).as("weapons"),
		])
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return {
		...row,
		weapons: row.weapons.map((row) => row.weaponSplId),
	};
}

export function findLayoutDataByIdentifier(
	identifier: string,
	loggedInUserId?: number,
) {
	return identifierToUserIdQuery(identifier)
		.select((eb) => [
			...COMMON_USER_FIELDS,
			"User.commissionText",
			"User.commissionsOpen",
			sql<Record<
				string,
				string
			> | null>`IIF(COALESCE("User"."patronTier", 0) >= 2, "User"."css", null)`.as(
				"css",
			),
			eb
				.selectFrom("TournamentResult")
				.whereRef("TournamentResult.userId", "=", "User.id")
				.select(({ fn }) => fn.countAll<number>().as("count"))
				.as("tournamentResultsCount"),
			eb
				.selectFrom("CalendarEventResultPlayer")
				.whereRef("CalendarEventResultPlayer.userId", "=", "User.id")
				.select(({ fn }) => fn.countAll<number>().as("count"))
				.as("calendarEventResultsCount"),
			eb
				.selectFrom("Build")
				.select(({ fn }) => fn.countAll<number>().as("count"))
				.whereRef("Build.ownerId", "=", "User.id")
				.where((eb) =>
					eb.or(
						[
							eb("Build.private", "=", 0),
							loggedInUserId ? eb("Build.ownerId", "=", loggedInUserId) : null,
						].filter((filter) => filter !== null),
					),
				)
				.as("buildsCount"),
			eb
				.selectFrom("VideoMatchPlayer")
				.innerJoin(
					"VideoMatch",
					"VideoMatch.id",
					"VideoMatchPlayer.videoMatchId",
				)
				.select(({ fn }) =>
					fn.count<number>("VideoMatch.videoId").distinct().as("count"),
				)
				.whereRef("VideoMatchPlayer.playerUserId", "=", "User.id")
				.as("vodsCount"),
			eb
				.selectFrom("Art")
				.leftJoin("ArtUserMetadata", "ArtUserMetadata.artId", "Art.id")
				.innerJoin("UserSubmittedImage", "UserSubmittedImage.id", "Art.imgId")
				.select(({ fn }) => fn.count<number>("Art.id").distinct().as("count"))
				.where((innerEb) =>
					innerEb.or([
						innerEb("Art.authorId", "=", sql.raw<any>("User.id")),
						innerEb("ArtUserMetadata.userId", "=", sql.raw<any>("User.id")),
					]),
				)
				.as("artCount"),
		])
		.$narrowType<{
			calendarEventResultsCount: NotNull;
			tournamentResultsCount: NotNull;
			buildsCount: NotNull;
			vodsCount: NotNull;
			artCount: NotNull;
		}>()
		.executeTakeFirst();
}

export async function findProfileByIdentifier(
	identifier: string,
	forceShowDiscordUniqueName?: boolean,
) {
	const row = await identifierToUserIdQuery(identifier)
		.leftJoin("PlusTier", "PlusTier.userId", "User.id")
		.select(({ eb }) => [
			"User.twitch",
			"User.youtubeId",
			"User.battlefy",
			"User.bsky",
			"User.country",
			"User.bio",
			"User.motionSens",
			"User.stickSens",
			"User.inGameName",
			"User.customName",
			"User.discordName",
			"User.showDiscordUniqueName",
			"User.discordUniqueName",
			"User.favoriteBadgeId",
			"PlusTier.tier as plusTier",
			jsonArrayFrom(
				eb
					.selectFrom("UserWeapon")
					.select(["UserWeapon.weaponSplId", "UserWeapon.isFavorite"])
					.whereRef("UserWeapon.userId", "=", "User.id")
					.orderBy("UserWeapon.order", "asc"),
			).as("weapons"),
			jsonObjectFrom(
				eb
					.selectFrom("TeamMember")
					.innerJoin("Team", "Team.id", "TeamMember.teamId")
					.leftJoin(
						"UserSubmittedImage",
						"UserSubmittedImage.id",
						"Team.avatarImgId",
					)
					.select([
						"Team.name",
						"Team.customUrl",
						"Team.id",
						"TeamMember.role as userTeamRole",
						"UserSubmittedImage.url as avatarUrl",
					])
					.whereRef("TeamMember.userId", "=", "User.id"),
			).as("team"),
			jsonArrayFrom(
				eb
					.selectFrom("TeamMemberWithSecondary")
					.innerJoin("Team", "Team.id", "TeamMemberWithSecondary.teamId")
					.leftJoin(
						"UserSubmittedImage",
						"UserSubmittedImage.id",
						"Team.avatarImgId",
					)
					.select([
						"Team.name",
						"Team.customUrl",
						"Team.id",
						"TeamMemberWithSecondary.role as userTeamRole",
						"UserSubmittedImage.url as avatarUrl",
					])
					.whereRef("TeamMemberWithSecondary.userId", "=", "User.id")
					.where("TeamMemberWithSecondary.isMainTeam", "=", 0),
			).as("secondaryTeams"),
			jsonArrayFrom(
				eb
					.selectFrom("BadgeOwner")
					.innerJoin("Badge", "Badge.id", "BadgeOwner.badgeId")
					.select(({ fn }) => [
						fn.count<number>("BadgeOwner.badgeId").as("count"),
						"Badge.id",
						"Badge.displayName",
						"Badge.code",
						"Badge.hue",
					])
					.whereRef("BadgeOwner.userId", "=", "User.id")
					.groupBy(["BadgeOwner.badgeId", "BadgeOwner.userId"]),
			).as("badges"),
			jsonArrayFrom(
				eb
					.selectFrom("SplatoonPlayer")
					.innerJoin(
						"XRankPlacement",
						"XRankPlacement.playerId",
						"SplatoonPlayer.id",
					)
					.select(({ fn }) => [
						"XRankPlacement.mode",
						fn.max<number>("XRankPlacement.power").as("power"),
						fn.min<number>("XRankPlacement.rank").as("rank"),
						"XRankPlacement.playerId",
					])
					.whereRef("SplatoonPlayer.userId", "=", "User.id")
					.groupBy(["XRankPlacement.mode"]),
			).as("topPlacements"),
		])
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return {
		...row,
		// TODO: sort in SQL
		badges: row.badges.sort((a, b) => {
			if (a.id === row.favoriteBadgeId) {
				return -1;
			}

			if (b.id === row.favoriteBadgeId) {
				return 1;
			}

			return a.id - b.id;
		}),
		discordUniqueName:
			forceShowDiscordUniqueName || row.showDiscordUniqueName
				? row.discordUniqueName
				: null,
	};
}

export function findByCustomUrl(customUrl: string) {
	return db
		.selectFrom("User")
		.select(["User.id", "User.discordId", "User.customUrl", "User.patronTier"])
		.where("customUrl", "=", customUrl)
		.executeTakeFirst();
}

export function findBannedStatusByUserId(userId: number) {
	return db
		.selectFrom("User")
		.select(["User.banned", "User.bannedReason"])
		.where("User.id", "=", userId)
		.executeTakeFirst();
}

const userIsTournamentOrganizer = sql<
	string | null
>`IIF(COALESCE("User"."patronTier", 0) >= 2, 1, "User"."isTournamentOrganizer")`.as(
	"isTournamentOrganizer",
);

export function findLeanById(id: number) {
	return db
		.selectFrom("User")
		.leftJoin("PlusTier", "PlusTier.userId", "User.id")
		.where("User.id", "=", id)
		.select(({ eb }) => [
			...COMMON_USER_FIELDS,
			"User.isArtist",
			"User.isVideoAdder",
			userIsTournamentOrganizer,
			"User.patronTier",
			"User.favoriteBadgeId",
			"User.languages",
			"User.inGameName",
			"User.preferences",
			"PlusTier.tier as plusTier",
			eb
				.selectFrom("UserFriendCode")
				.select("UserFriendCode.friendCode")
				.where("UserFriendCode.userId", "=", id)
				.orderBy("UserFriendCode.createdAt", "desc")
				.limit(1)
				.as("friendCode"),
		])
		.executeTakeFirst();
}

export function findAllPatrons() {
	return db
		.selectFrom("User")
		.select(["User.id", "User.discordId", "User.username", "User.patronTier"])
		.where("User.patronTier", "is not", null)
		.orderBy("User.patronTier", "desc")
		.orderBy("User.patronSince", "asc")
		.execute();
}

export function findAllPlusMembers() {
	return db
		.selectFrom("User")
		.innerJoin("PlusTier", "PlusTier.userId", "User.id")
		.select(["User.id", "User.discordId", "PlusTier.tier as plusTier"])
		.execute();
}

const withMaxEventStartTime = (eb: ExpressionBuilder<DB, "CalendarEvent">) => {
	return eb
		.selectFrom("CalendarEventDate")
		.select(({ fn }) => [fn.max("CalendarEventDate.startTime").as("startTime")])
		.whereRef("CalendarEventDate.eventId", "=", "CalendarEvent.id")
		.as("startTime");
};
export function findResultsByUserId(userId: number) {
	return db
		.selectFrom("CalendarEventResultPlayer")
		.innerJoin(
			"CalendarEventResultTeam",
			"CalendarEventResultTeam.id",
			"CalendarEventResultPlayer.teamId",
		)
		.innerJoin(
			"CalendarEvent",
			"CalendarEvent.id",
			"CalendarEventResultTeam.eventId",
		)
		.select(({ eb, exists, selectFrom }) => [
			"CalendarEvent.id as eventId",
			sql<number>`null`.as("tournamentId"),
			"CalendarEventResultTeam.placement",
			"CalendarEvent.participantCount",
			"CalendarEvent.name as eventName",
			"CalendarEventResultTeam.id as teamId",
			"CalendarEventResultTeam.name as teamName",
			// TODO: can we get rid of the "as"?
			withMaxEventStartTime(eb as ExpressionBuilder<DB, "CalendarEvent">),
			exists(
				selectFrom("UserResultHighlight")
					.where("UserResultHighlight.userId", "=", userId)
					.whereRef(
						"UserResultHighlight.teamId",
						"=",
						"CalendarEventResultTeam.id",
					)
					.select("UserResultHighlight.userId"),
			).as("isHighlight"),
			jsonArrayFrom(
				eb
					.selectFrom("CalendarEventResultPlayer")
					.leftJoin("User", "User.id", "CalendarEventResultPlayer.userId")
					.select([...COMMON_USER_FIELDS, "CalendarEventResultPlayer.name"])
					.whereRef(
						"CalendarEventResultPlayer.teamId",
						"=",
						"CalendarEventResultTeam.id",
					)
					.where((eb) =>
						eb.or([
							eb("CalendarEventResultPlayer.userId", "is", null),
							eb("CalendarEventResultPlayer.userId", "!=", userId),
						]),
					),
			).as("mates"),
		])
		.where("CalendarEventResultPlayer.userId", "=", userId)
		.unionAll(
			db
				.selectFrom("TournamentResult")
				.innerJoin(
					"TournamentTeam",
					"TournamentTeam.id",
					"TournamentResult.tournamentTeamId",
				)
				.innerJoin(
					"CalendarEvent",
					"CalendarEvent.tournamentId",
					"TournamentResult.tournamentId",
				)
				.select(({ eb }) => [
					sql<number>`null`.as("eventId"),
					"TournamentResult.tournamentId",
					"TournamentResult.placement",
					"TournamentResult.participantCount",
					"CalendarEvent.name as eventName",
					"TournamentTeam.id as teamId",
					"TournamentTeam.name as teamName",
					withMaxEventStartTime(eb),
					"TournamentResult.isHighlight",
					jsonArrayFrom(
						eb
							.selectFrom("TournamentResult as TournamentResult2")
							.innerJoin("User", "User.id", "TournamentResult2.userId")
							.select([
								...COMMON_USER_FIELDS,
								sql<string | null>`null`.as("name"),
							])
							.whereRef(
								"TournamentResult2.tournamentTeamId",
								"=",
								"TournamentResult.tournamentTeamId",
							)
							.where("TournamentResult2.userId", "!=", userId),
					).as("mates"),
				])
				.where("TournamentResult.userId", "=", userId),
		)
		.orderBy("startTime", "desc")
		.$narrowType<{ startTime: NotNull }>()
		.execute();
}

const searchSelectedFields = ({ fn }: { fn: FunctionModule<DB, "User"> }) =>
	[
		...COMMON_USER_FIELDS,
		"User.inGameName",
		"PlusTier.tier as plusTier",
		fn<string | null>("iif", [
			"User.showDiscordUniqueName",
			"User.discordUniqueName",
			sql`null`,
		]).as("discordUniqueName"),
	] as const;
export async function search({
	query,
	limit,
}: {
	query: string;
	limit: number;
}) {
	let exactMatches: Array<
		CommonUser & {
			inGameName: string | null;
			plusTier: number | null;
			discordUniqueName: string | null;
		}
	> = [];
	if (query.length > 1) {
		exactMatches = await db
			.selectFrom("User")
			.leftJoin("PlusTier", "PlusTier.userId", "User.id")
			.select(searchSelectedFields)
			.where((eb) =>
				eb.or([
					eb("User.username", "like", query),
					eb("User.inGameName", "like", query),
					eb("User.discordUniqueName", "like", query),
					eb("User.customUrl", "like", query),
				]),
			)
			.orderBy(
				(eb) =>
					eb
						.case()
						.when("PlusTier.tier", "is", null)
						.then(4)
						.else(eb.ref("PlusTier.tier"))
						.end(),
				"asc",
			)
			.limit(limit)
			.execute();
	}

	const fuzzyQuery = `%${query}%`;
	const fuzzyMatches = await db
		.selectFrom("User")
		.leftJoin("PlusTier", "PlusTier.userId", "User.id")
		.select(searchSelectedFields)
		.where((eb) =>
			eb
				.or([
					eb("User.username", "like", fuzzyQuery),
					eb("User.inGameName", "like", fuzzyQuery),
					eb("User.discordUniqueName", "like", fuzzyQuery),
				])
				.and(
					"User.id",
					"not in",
					exactMatches.map((match) => match.id),
				),
		)
		.orderBy(
			(eb) =>
				eb
					.case()
					.when("PlusTier.tier", "is", null)
					.then(4)
					.else(eb.ref("PlusTier.tier"))
					.end(),
			"asc",
		)
		.limit(limit - exactMatches.length)
		.execute();

	return [...exactMatches, ...fuzzyMatches];
}

export function searchExact(args: {
	id?: number;
	discordId?: string;
	customUrl?: string;
}) {
	let query = db
		.selectFrom("User")
		.leftJoin("PlusTier", "PlusTier.userId", "User.id")
		.select(searchSelectedFields);

	let filtered = false;

	if (typeof args.id === "number") {
		filtered = true;
		query = query.where("User.id", "=", args.id);
	}

	if (typeof args.discordId === "string") {
		filtered = true;
		query = query.where("User.discordId", "=", args.discordId);
	}

	if (typeof args.customUrl === "string") {
		filtered = true;
		query = query.where("User.customUrl", "=", args.customUrl);
	}

	invariant(filtered, "No search criteria provided");

	return query.execute();
}

export async function currentFriendCodeByUserId(userId: number) {
	return db
		.selectFrom("UserFriendCode")
		.select([
			"UserFriendCode.friendCode",
			"UserFriendCode.createdAt",
			"UserFriendCode.submitterUserId",
		])
		.where("userId", "=", userId)
		.orderBy("UserFriendCode.createdAt desc")
		.limit(1)
		.executeTakeFirst();
}

export async function inGameNameByUserId(userId: number) {
	return (
		await db
			.selectFrom("User")
			.select("User.inGameName")
			.where("id", "=", userId)
			.executeTakeFirst()
	)?.inGameName;
}

export function insertFriendCode(args: TablesInsertable["UserFriendCode"]) {
	return db.insertInto("UserFriendCode").values(args).execute();
}

export function upsert(
	args: Pick<
		TablesInsertable["User"],
		| "discordId"
		| "discordName"
		| "discordAvatar"
		| "discordUniqueName"
		| "twitch"
		| "youtubeId"
		| "bsky"
	>,
) {
	return db
		.insertInto("User")
		.values(args)
		.onConflict((oc) => {
			const { discordId, ...rest } = args;

			return oc.column("discordId").doUpdateSet(rest);
		})
		.returning("id")
		.executeTakeFirstOrThrow();
}

type UpdateProfileArgs = Pick<
	TablesInsertable["User"],
	| "country"
	| "bio"
	| "customUrl"
	| "customName"
	| "motionSens"
	| "stickSens"
	| "inGameName"
	| "battlefy"
	| "css"
	| "favoriteBadgeId"
	| "showDiscordUniqueName"
	| "commissionText"
	| "commissionsOpen"
> & {
	userId: number;
	weapons: Pick<TablesInsertable["UserWeapon"], "weaponSplId" | "isFavorite">[];
};
export function updateProfile(args: UpdateProfileArgs) {
	return db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("UserWeapon")
			.where("userId", "=", args.userId)
			.execute();

		if (args.weapons.length > 0) {
			await trx
				.insertInto("UserWeapon")
				.values(
					args.weapons.map((weapon, i) => ({
						userId: args.userId,
						weaponSplId: weapon.weaponSplId,
						isFavorite: weapon.isFavorite,
						order: i + 1,
					})),
				)
				.execute();
		}

		return trx
			.updateTable("User")
			.set({
				country: args.country,
				bio: args.bio,
				customUrl: args.customUrl,
				customName: args.customName,
				motionSens: args.motionSens,
				stickSens: args.stickSens,
				inGameName: args.inGameName,
				css: args.css,
				battlefy: args.battlefy,
				favoriteBadgeId: args.favoriteBadgeId,
				showDiscordUniqueName: args.showDiscordUniqueName,
				commissionText: args.commissionText,
				commissionsOpen: args.commissionsOpen,
			})
			.where("id", "=", args.userId)
			.returning(["User.id", "User.customUrl", "User.discordId"])
			.executeTakeFirstOrThrow();
	});
}

export function updatePreferences(
	userId: number,
	newPreferences: UserPreferences,
) {
	return db.transaction().execute(async (trx) => {
		const current =
			(
				await trx
					.selectFrom("User")
					.select("User.preferences")
					.where("id", "=", userId)
					.executeTakeFirstOrThrow()
			).preferences ?? {};

		const mergedPreferences = {
			...current,
			...newPreferences,
		};

		await trx
			.updateTable("User")
			.set({
				preferences: JSON.stringify(mergedPreferences),
			})
			.where("id", "=", userId)
			.execute();
	});
}

type UpdateResultHighlightsArgs = {
	userId: number;
	resultTeamIds: Array<number>;
	resultTournamentTeamIds: Array<number>;
};
export function updateResultHighlights(args: UpdateResultHighlightsArgs) {
	return db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("UserResultHighlight")
			.where("userId", "=", args.userId)
			.execute();

		if (args.resultTeamIds.length > 0) {
			await trx
				.insertInto("UserResultHighlight")
				.values(
					args.resultTeamIds.map((teamId) => ({
						userId: args.userId,
						teamId,
					})),
				)
				.execute();
		}

		await trx
			.updateTable("TournamentResult")
			.set({
				isHighlight: 0,
			})
			.where("TournamentResult.userId", "=", args.userId)
			.execute();

		if (args.resultTournamentTeamIds.length > 0) {
			await trx
				.updateTable("TournamentResult")
				.set({
					isHighlight: 1,
				})
				.where("TournamentResult.userId", "=", args.userId)
				.where(
					"TournamentResult.tournamentTeamId",
					"in",
					args.resultTournamentTeamIds,
				)
				.execute();
		}
	});
}

export function updateBuildSorting({
	userId,
	buildSorting,
}: { userId: number; buildSorting: BuildSort[] | null }) {
	return db
		.updateTable("User")
		.set({ buildSorting: buildSorting ? JSON.stringify(buildSorting) : null })
		.where("id", "=", userId)
		.execute();
}

export type UpdatePatronDataArgs = Array<
	Pick<User, "discordId" | "patronTier" | "patronSince">
>;
export function updatePatronData(users: UpdatePatronDataArgs) {
	return db.transaction().execute(async (trx) => {
		await trx
			.updateTable("User")
			.set({
				patronTier: null,
				patronSince: null,
				patronTill: null,
			})
			.where((eb) =>
				eb.or([
					eb("patronTill", "<", dateToDatabaseTimestamp(new Date())),
					eb("patronTill", "is", null),
				]),
			)
			.execute();

		for (const user of users) {
			await trx
				.updateTable("User")
				.set({
					patronTier: user.patronTier,
					patronSince: user.patronSince,
					patronTill: null,
				})
				.where("User.discordId", "=", user.discordId)
				.execute();
		}
	});
}

// TODO: use Kysely
const updateByDiscordIdStm = dbDirect.prepare(/* sql */ `
  update
    "User"
  set
    "discordAvatar" = @discordAvatar,
    "discordName" = coalesce(@discordName, "discordName"),
    "discordUniqueName" = coalesce(@discordUniqueName, "discordUniqueName")
  where
    "discordId" = @discordId
`);
export const updateMany = dbDirect.transaction(
	(
		argsArr: Array<
			Pick<
				User,
				"discordAvatar" | "discordName" | "discordUniqueName" | "discordId"
			>
		>,
	) => {
		for (const updateArgs of argsArr) {
			updateByDiscordIdStm.run(updateArgs);
		}
	},
);

import {
	type Expression,
	type ExpressionBuilder,
	type SelectQueryBuilder,
	type SqlBool,
	sql,
} from "kysely";
import * as R from "remeda";
import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { weaponIdToArrayWithAlts } from "~/modules/in-game-lists/weapon-ids";
import {
	dateToDatabaseTimestamp,
	dayMonthYearToDatabaseTimestamp,
} from "~/utils/dates";
import { invariant } from "~/utils/invariant";
import {
	type CommonUser,
	commonUserJsonObject,
	commonUserSelect,
	jsonArrayFrom,
} from "~/utils/kysely.server";
import { VODS_PAGE_BATCH_SIZE } from "./vods-constants";
import type { VideoBeingAdded, Vod } from "./vods-types";
import {
	extractYoutubeIdFromVideoUrl,
	hoursMinutesSecondsStringToSeconds,
} from "./vods-utils";

export async function findByUserId(userId: Tables["User"]["id"], limit = 100) {
	return findVods({ userId, limit });
}

type VodFilters = {
	weapon?: MainWeaponId;
	mode?: ModeShort;
	stageId?: StageId;
	type?: Tables["Video"]["type"];
	userId?: number;
};

/** Page of the vods matching the filters, newest first, with the weapons and players of their matching match rows. */
export async function findVods({
	limit = VODS_PAGE_BATCH_SIZE,
	offset = 0,
	...filters
}: VodFilters & {
	limit?: number;
	offset?: number;
}) {
	const result = await vodsWithMatches()
		.selectAll("Video")
		.select(({ fn, ref, eb }) => [
			sql<
				Array<number>
			>`json_group_array(distinct ${ref("VideoMatchPlayer.weaponSplId")})`
				.$castTo<MainWeaponId[]>()
				.as("weapons"),
			fn
				.agg("json_group_array", ["VideoMatchPlayer.playerName"])
				.$castTo<string[]>()
				.as("playerNames"),
			jsonArrayFrom(
				eb
					.selectFrom("User")
					.select((playerEb) => commonUserSelect(playerEb))
					.whereRef("User.id", "=", "VideoMatchPlayer.playerUserId"),
			).as("players"),
		])
		.where(vodFilters(filters))
		// the page is resolved by id first: with the limit on this read, the aggregates
		// of every matching vod would be computed before it applies
		.where(
			"Video.id",
			"in",
			filteredVideoIds(filters)
				.orderBy("Video.youtubePublishedAt", "desc")
				.limit(limit)
				.offset(offset),
		)
		.groupBy("Video.id")
		.orderBy("Video.youtubePublishedAt", "desc")
		.execute();

	const vods = result.map((value) => {
		const { playerNames, players, ...vod } = value;
		return {
			...vod,
			pov: playerNames[0] ?? players[0],
		};
	});
	return vods;
}

/** How many vods match the filters. */
export async function countVods(filters: VodFilters) {
	const result = await db
		.selectFrom(filteredVideoIds(filters).as("filtered"))
		.select(({ fn }) => fn.countAll<number>().as("count"))
		.executeTakeFirstOrThrow();

	return result.count;
}

export async function findVodById(id: Tables["Video"]["id"]) {
	const videoQuery = db
		.selectFrom("Video")
		.select([
			"id",
			"title",
			"youtubePublishedAt",
			"youtubeId",
			"type",
			"submitterUserId",
		])
		.where("Video.id", "=", id);

	const video = await videoQuery.executeTakeFirst();

	if (video) {
		const videoMatchQuery = db
			.selectFrom("VideoMatch")
			.select([
				"VideoMatch.id",
				"VideoMatch.mode",
				"VideoMatch.stageId",
				"VideoMatch.startsAt",
			])
			.leftJoin(
				"VideoMatchPlayer",
				"VideoMatch.id",
				"VideoMatchPlayer.videoMatchId",
			)
			.leftJoin("User", "VideoMatchPlayer.playerUserId", "User.id")
			.select(({ fn, eb }) => [
				fn
					.agg("json_group_array", ["VideoMatchPlayer.weaponSplId"])
					.$castTo<MainWeaponId[]>()
					.as("weapons"),
				fn
					.agg("json_group_array", ["VideoMatchPlayer.playerName"])
					.filterWhere("VideoMatchPlayer.playerName", "is not", null)
					.$castTo<string[]>()
					.as("playerNames"),
				fn
					.agg("json_group_array", [commonUserJsonObject(eb)])
					.filterWhere("User.username", "is not", null)
					.$castTo<CommonUser[]>()
					.as("players"),
			])
			.where("VideoMatch.videoId", "=", id)
			.groupBy("VideoMatch.id")
			.orderBy("VideoMatch.startsAt", "asc")
			.orderBy("VideoMatchPlayer.player", "asc");

		const matches = await videoMatchQuery.execute();

		const pov = resolvePov(matches);
		const povUserId = typeof pov === "string" ? undefined : pov?.id;

		return {
			...video,
			pov,
			matches: R.map(matches, R.omit(["players", "playerNames"])),
			permissions: {
				EDIT:
					povUserId === undefined
						? [video.submitterUserId]
						: [video.submitterUserId, povUserId],
			},
		};
	}
	return null;
}

function resolvePov(
	matches: Array<{ playerNames: string[]; players: CommonUser[] }>,
): Vod["pov"] {
	for (const match of matches) {
		if (match.playerNames.length > 0) {
			return match.playerNames[0];
		}

		if (match.players.length > 0) {
			return match.players[0];
		}
	}

	return;
}

export async function update(
	args: VideoBeingAdded & {
		isValidated: boolean;
		id: number;
	},
) {
	return save(args);
}

export async function insert(
	args: VideoBeingAdded & {
		submitterUserId: number;
		isValidated: boolean;
	},
) {
	return save(args);
}

async function save(
	args: VideoBeingAdded & {
		submitterUserId?: number;
		isValidated: boolean;
		id?: number;
	},
) {
	const youtubeId = extractYoutubeIdFromVideoUrl(args.youtubeUrl);
	invariant(youtubeId, "Invalid YouTube URL");
	return db.transaction().execute(async (trx) => {
		let videoId: number;
		const video = {
			title: args.title,
			type: args.type,
			youtubePublishedAt: dayMonthYearToDatabaseTimestamp(args.date),
			eventId: args.eventId ?? null,
			youtubeId,
			validatedAt: args.isValidated
				? dateToDatabaseTimestamp(new Date())
				: null,
		};
		if (args.id) {
			await trx
				.deleteFrom("VideoMatch")
				.where("videoId", "=", args.id)
				.execute();

			// editing keeps the video's original submitter
			await trx
				.updateTable("UnvalidatedVideo")
				.set(video)
				.where("id", "=", args.id)
				.execute();
			videoId = args.id;
		} else {
			invariant(
				typeof args.submitterUserId === "number",
				"Submitter is required to add a video",
			);
			const result = await trx
				.insertInto("UnvalidatedVideo")
				.values({ ...video, submitterUserId: args.submitterUserId })
				.returning("UnvalidatedVideo.id")
				.executeTakeFirstOrThrow();
			videoId = result.id;
		}

		const insertedMatches = await trx
			.insertInto("VideoMatch")
			.values(
				args.matches.map((match) => ({
					videoId,
					startsAt: hoursMinutesSecondsStringToSeconds(match.startsAt),
					stageId: match.stageId,
					mode: match.mode,
				})),
			)
			.returning("VideoMatch.id")
			.execute();

		// RETURNING makes no ordering promise, so sort to line the ids up with args.matches
		const matchIds = insertedMatches
			.map((match) => match.id)
			.sort((a, b) => a - b);

		const players = args.matches.flatMap((match, matchIdx) =>
			match.weapons.map((weaponSplId, weaponIdx) => ({
				videoMatchId: matchIds[matchIdx],
				playerUserId: args.pov?.type === "USER" ? args.pov.userId : null,
				playerName: args.pov?.type === "NAME" ? args.pov.name : null,
				weaponSplId,
				player: weaponIdx + 1,
			})),
		);

		await trx.insertInto("VideoMatchPlayer").values(players).execute();

		return { ...video, id: videoId };
	});
}

export function deleteById(id: number) {
	return db.deleteFrom("UnvalidatedVideo").where("id", "=", id).execute();
}

const vodsWithMatches = () =>
	db
		.selectFrom("Video")
		.leftJoin("VideoMatch", "VideoMatch.videoId", "Video.id")
		.leftJoin(
			"VideoMatchPlayer",
			"VideoMatch.id",
			"VideoMatchPlayer.videoMatchId",
		);

type VodsWithMatchesDB =
	ReturnType<typeof vodsWithMatches> extends SelectQueryBuilder<
		infer JoinedDB,
		any,
		any
	>
		? JoinedDB
		: never;

type VodsTables = "Video" | "VideoMatch" | "VideoMatchPlayer";

/** Conditions the filters put on the match rows. `userId` makes the vod's own filters moot: it is the user's vods regardless. */
function vodFilters({ weapon, mode, stageId, type, userId }: VodFilters) {
	return (eb: ExpressionBuilder<VodsWithMatchesDB, VodsTables>) => {
		const conditions: Expression<SqlBool>[] = [];
		if (userId) {
			conditions.push(eb("VideoMatchPlayer.playerUserId", "=", userId));
		} else {
			if (type) {
				conditions.push(eb("Video.type", "=", type));
			}
			if (mode) {
				conditions.push(eb("VideoMatch.mode", "=", mode));
			}
			if (stageId !== undefined) {
				conditions.push(eb("VideoMatch.stageId", "=", stageId));
			}
		}
		if (weapon !== undefined) {
			conditions.push(
				eb(
					"VideoMatchPlayer.weaponSplId",
					"in",
					weaponIdToArrayWithAlts(weapon),
				),
			);
		}

		return eb.and(conditions);
	};
}

/**
 * Ids of the vods matching the filters, joined only as far as a filter reads: inner joins
 * let a player level filter start from the player rows' index instead of walking every vod.
 */
function filteredVideoIds(filters: VodFilters) {
	const { type, userId, mode, stageId, weapon } = filters;
	const filtersPlayers = userId !== undefined || weapon !== undefined;
	const filtersMatches =
		!filtersPlayers && (mode !== undefined || stageId !== undefined);

	return db
		.selectFrom("Video")
		.select("Video.id")
		.distinct()
		.$if(Boolean(type) && !userId, (qb) => qb.where("Video.type", "=", type!))
		.$if(filtersPlayers, (qb) =>
			qb
				.innerJoin("VideoMatch", "VideoMatch.videoId", "Video.id")
				.innerJoin(
					"VideoMatchPlayer",
					"VideoMatch.id",
					"VideoMatchPlayer.videoMatchId",
				)
				.where(vodFilters(filters)),
		)
		.$if(filtersMatches, (qb) =>
			qb
				.innerJoin("VideoMatch", "VideoMatch.videoId", "Video.id")
				.leftJoin(
					"VideoMatchPlayer",
					"VideoMatch.id",
					"VideoMatchPlayer.videoMatchId",
				)
				.where(vodFilters(filters)),
		);
}

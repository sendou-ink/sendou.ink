import { expressionBuilder, sql } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/sqlite";
import * as R from "remeda";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
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
import invariant from "~/utils/invariant";
import { VODS_PAGE_BATCH_SIZE } from "./vods-constants";
import type { VideoBeingAdded, Vod } from "./vods-types";
import {
	extractYoutubeIdFromVideoUrl,
	hoursMinutesSecondsStringToSeconds,
} from "./vods-utils";

export function deleteById(id: number) {
	return db.deleteFrom("UnvalidatedVideo").where("id", "=", id).execute();
}

export async function findVodsByUserId(
	userId: Tables["User"]["id"],
	limit = 100,
) {
	return findVods({ userId, limit });
}

export async function findVods({
	weapon,
	mode,
	stageId,
	type,
	userId,
	limit = VODS_PAGE_BATCH_SIZE,
}: {
	weapon?: MainWeaponId;
	mode?: ModeShort;
	stageId?: StageId;
	type?: Tables["Video"]["type"];
	userId?: number;
	limit?: number;
}) {
	let query = db
		.selectFrom("Video")
		.leftJoin("VideoMatch", "Video.id", "VideoMatch.videoId")
		.leftJoin(
			"VideoMatchPlayer",
			"VideoMatch.id",
			"VideoMatchPlayer.videoMatchId",
		)
		.leftJoin("User", "VideoMatchPlayer.playerUserId", "User.id")
		.selectAll("Video")
		.select(({ fn, ref }) => [
			sql<
				Array<number>
			>`json_group_array(distinct ${ref("VideoMatchPlayer.weaponSplId")})`
				.$castTo<MainWeaponId[]>()
				.as("weapons"),
			fn
				.agg("json_group_array", ["VideoMatchPlayer.playerName"])
				.$castTo<string[]>()
				.as("playerNames"),
			selectPlayers(),
		]);
	if (userId) {
		query = query.where("User.id", "=", userId);
	} else {
		if (type) {
			query = query.where("Video.type", "=", type);
		}
		if (mode) {
			query = query.where("VideoMatch.mode", "=", mode);
		}
		if (stageId) {
			query = query.where("VideoMatch.stageId", "=", stageId);
		}
	}
	if (weapon) {
		query = query.where(
			"VideoMatchPlayer.weaponSplId",
			"in",
			weaponIdToArrayWithAlts(weapon),
		);
	}
	const result = await query
		.groupBy("Video.id")
		.orderBy("Video.youtubeDate", "desc")
		.limit(limit)
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

export async function findVodById(id: Tables["Video"]["id"]) {
	const videoQuery = db
		.selectFrom("Video")
		.select([
			"id",
			"title",
			"youtubeDate",
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
			.select(selectPlayers())
			.select(({ fn }) => [
				fn
					.agg("json_group_array", ["VideoMatchPlayer.weaponSplId"])
					.$castTo<MainWeaponId[]>()
					.as("weapons"),
				fn
					.agg("json_group_array", ["VideoMatchPlayer.playerName"])
					.as("playerNames"),
			])
			.where("VideoMatch.videoId", "=", id)
			.groupBy("VideoMatch.id")
			.orderBy("VideoMatch.startsAt", "asc")
			.orderBy("VideoMatchPlayer.player", "asc");

		const matches = await videoMatchQuery.execute();

		return {
			...video,
			pov: resolvePov(matches),
			matches: R.map(matches, R.omit(["players", "playerNames"])),
		};
	}
	return null;
}

function resolvePov(matches: any): Vod["pov"] {
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

export async function updateVodByReplacing(
	args: VideoBeingAdded & {
		submitterUserId: number;
		isValidated: boolean;
		id: number;
	},
) {
	return createVod(args);
}

export async function createVod(
	args: VideoBeingAdded & {
		submitterUserId: number;
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
			youtubeDate: dayMonthYearToDatabaseTimestamp(args.date),
			eventId: args.eventId ?? null,
			youtubeId,
			submitterUserId: args.submitterUserId,
			validatedAt: args.isValidated
				? dateToDatabaseTimestamp(new Date())
				: null,
		};
		if (args.id) {
			await trx
				.deleteFrom("VideoMatch")
				.where("videoId", "=", args.id)
				.execute();

			await trx
				.updateTable("UnvalidatedVideo")
				.set(video)
				.where("id", "=", args.id)
				.execute();
			videoId = args.id;
		} else {
			const result = await trx
				.insertInto("UnvalidatedVideo")
				.values(video)
				.returning("UnvalidatedVideo.id")
				.executeTakeFirstOrThrow();
			videoId = result.id;
		}
		for (const match of args.matches) {
			const videoMatchResult = await trx
				.insertInto("VideoMatch")
				.values({
					videoId: videoId,
					startsAt: hoursMinutesSecondsStringToSeconds(match.startsAt),
					stageId: match.stageId,
					mode: match.mode,
				})
				.returning("VideoMatch.id")
				.executeTakeFirstOrThrow();
			const matchId = videoMatchResult.id;

			for (const [i, weaponSplId] of match.weapons.entries()) {
				await trx
					.insertInto("VideoMatchPlayer")
					.values({
						videoMatchId: matchId,
						playerUserId: args.pov?.type === "USER" ? args.pov.userId : null,
						playerName: args.pov?.type === "NAME" ? args.pov.name : null,
						weaponSplId,
						player: i + 1,
					})
					.executeTakeFirstOrThrow();
			}
		}
		return { ...video, id: videoId };
	});
}

function selectPlayers() {
	const eb = expressionBuilder<DB>();

	return jsonArrayFrom(
		eb
			.selectFrom("User")
			.select([
				"User.username",
				"User.discordId",
				"User.discordAvatar",
				"User.customUrl",
			]),
	).as("players");
}

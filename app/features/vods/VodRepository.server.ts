import { sql } from "kysely";
import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { weaponIdToArrayWithAlts } from "~/modules/in-game-lists/weapon-ids";
import { selectPlayers } from "~/utils/kysely.server";
import { logger } from "~/utils/logger";
import { VODS_PAGE_BATCH_SIZE } from "./vods-constants";
import type { ListVod, Vod } from "./vods-types";

export function deleteById(id: number) {
	return db.deleteFrom("UnvalidatedVideo").where("id", "=", id).execute();
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
}): Promise<Array<ListVod>> {
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
		query = query.where((eb) =>
			eb.or(
				weaponIdToArrayWithAlts(weapon).map((weapon) => {
					return eb("VideoMatchPlayer.weaponSplId", "=", weapon);
				}),
			),
		);
	}
	const result = query
		.groupBy("Video.id")
		.orderBy("Video.youtubeDate", "desc")
		.limit(limit)
		.execute();

	const vods = (await result).map((value) => {
		const { playerNames, players, ...vod } = value;
		const playerNamesArray: string[] = playerNames as string[];
		const playersArray: Tables["User"][] = players as Tables["User"][];
		return {
			...vod,
			pov: playerNamesArray[0] ?? playersArray[0],
		};
	});
	return vods as ListVod[];
}

export async function findVodById(
	id: Tables["Video"]["id"],
): Promise<Vod | null> {
	const video_query = db
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

	const video = await video_query.executeTakeFirst();

	if (video) {
		const video_match_query = db
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

		const matches = await video_match_query.execute();

		return {
			...video,
			pov: resolvePov(matches),
			matches: matches.map(({ players: _1, playerNames: _2, ...match }) => {
				return {
					...match,
				};
			}),
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

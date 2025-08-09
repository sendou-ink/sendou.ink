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
import { VODS_PAGE_BATCH_SIZE } from "./vods-constants";
import type { ListVod } from "./vods-types";

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

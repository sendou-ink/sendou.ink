import { sql } from "~/db/sql";
import type { Video } from "~/db/types";
import type { MainWeaponId, ModeShort, StageId } from "~/modules/in-game-lists";
import { removeDuplicates } from "~/utils/arrays";
import { parseDBArray, parseDBJsonArray } from "~/utils/sql";
import { weaponIdToArrayWithAlts } from "../../../modules/in-game-lists/weapon-ids";
import { VODS_PAGE_BATCH_SIZE } from "../vods-constants";
import type { ListVod } from "../vods-types";

const query = (byUser?: true) => /* sql */ `
  select
    v."id",
    v."title",
    v."youtubeId",
    v."type",
    json_group_array("vp"."weaponSplId") as "weapons",
    json_group_array("vp"."playerName") as "playerNames",
    json_group_array(
      json_object(
        'username',
        "u"."username",
        'discordId',
        "u"."discordId",
        'discordAvatar',
        "u"."discordAvatar",
        'customUrl',
        "u"."customUrl"
      )
    ) as "players"
  from "Video" v
  left join "VideoMatch" vm on v."id" = vm."videoId"
  left join "VideoMatchPlayer" vp on vm."id" = vp."videoMatchId"
  left join "User" u on vp."playerUserId" = u."id"
  where ${
		byUser
			? /* sql */ `u."id" = @userId`
			: /* sql */ `
    v."type" = coalesce(@type, v."type")
    and vm."mode" = coalesce(@mode, vm."mode")
    and vm."stageId" = coalesce(@stageId, vm."stageId")`
	}
  group by v."id"
  order by v."youtubeDate" desc
`;

const stm = sql.prepare(query());
const stmByUser = sql.prepare(query(true));

export function findVods({
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
	type?: Video["type"];
	userId?: number;
	limit?: number;
}): Array<ListVod> {
	const stmToUse = userId ? stmByUser : stm;

	const vods = stmToUse.all({
		mode: mode ?? null,
		stageId: stageId ?? null,
		type: type ?? null,
		userId: userId ?? null,
	}) as any[];

	const weaponIdsToFilterBy = weapon
		? weaponIdToArrayWithAlts(Number(weapon) as MainWeaponId) // TODO: fix on caller side
		: [];

	return vods
		.filter((vod) => {
			if (weaponIdsToFilterBy.length === 0) return true;
			return parseDBArray(vod.weapons).some((weaponId: any) =>
				weaponIdsToFilterBy.includes(weaponId),
			);
		})
		.map(({ playerNames: playerNamesRaw, players: playersRaw, ...vod }) => {
			const playerNames = parseDBArray(playerNamesRaw);
			const players = parseDBJsonArray(playersRaw);

			return {
				...vod,
				weapons: removeDuplicates(parseDBArray(vod.weapons)),
				pov: playerNames[0] ?? players[0],
			};
		})
		.slice(0, limit);
}

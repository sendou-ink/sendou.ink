import { sql } from "~/db/sql";
import { parseDBArray } from "~/utils/sql";
import type { Vod } from "../vods-types";

const videoStm = sql.prepare(/* sql */ `
  select
    v."id",
    v."title",
    v."youtubeDate",
    v."youtubeId",
    v."type",
    v."submitterUserId"
  from "Video" v
  where v."id" = @id
`);

const videoMatchesStm = sql.prepare(/* sql */ `
  select
    vm."id",
    vm."mode",
    vm."stageId",
    vm."startsAt",
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
        "u"."customUrl",
        'id',
        "u"."id"
      )
    ) as "players"
  from "VideoMatch" vm
  left join "VideoMatchPlayer" vp on vm."id" = vp."videoMatchId"
  left join "User" u on vp."playerUserId" = u."id"
  where vm."videoId" = @id
  group by vm."id"
  order by vm."startsAt" asc, vp."player" asc
`);

export function findVodById(id: Vod["id"]): Vod | null {
	const video = videoStm.get({ id }) as any;
	if (!video) return null;

	const matches = videoMatchesStm.all({ id }) as any[];

	return {
		...video,
		pov: resolvePov(matches),
		matches: matches.map(({ players: _1, playerNames: _2, ...match }) => {
			return {
				...match,
				weapons: parseDBArray(match.weapons),
			};
		}),
	};
}

function resolvePov(matches: any): Vod["pov"] {
	for (const match of matches) {
		if (parseDBArray(match.playerNames).length > 0) {
			return parseDBArray(match.playerNames)[0];
		}

		if (parseDBArray(match.players).length > 0) {
			return parseDBArray(match.players)[0];
		}
	}

	return;
}

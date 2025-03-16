import { sql } from "~/db/sql";
import type { PlayerResult, User } from "~/db/types";

const stm = sql.prepare(/* sql */ `
  select
    "mapWins",
    "mapLosses",
    "setWins",
    "setLosses",
    json_object(
      'id', "User"."id",
      'username', "User"."username",
      'discordAvatar', "User"."discordAvatar",
      'discordId', "User"."discordId",
      'customUrl', "User"."customUrl"
    ) as "user"
  from "PlayerResult"
  left join "User" on "User"."id" = "PlayerResult"."otherUserId"
  where
    "ownerUserId" = @userId
    and "season" = @season
    and "type" = @type
  order by "mapWins" + "mapLosses" desc
`);

export function seasonsMatesEnemiesByUserId({
	userId,
	season,
	type,
}: {
	userId: number;
	season: number;
	type: PlayerResult["type"];
}) {
	const rows = stm.all({ userId, season, type }) as any[];

	return rows.map((row) => ({
		...row,
		user: JSON.parse(row.user),
	})) as Array<{
		mapWins: number;
		mapLosses: number;
		setWins: number;
		setLosses: number;
		user: Pick<
			User,
			"id" | "username" | "discordAvatar" | "discordId" | "customUrl"
		>;
	}>;
}

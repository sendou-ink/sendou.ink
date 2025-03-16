import { sql } from "~/db/sql";
import { parseDBArray, parseDBJsonArray } from "~/utils/sql";
import type { ListedArt } from "../art-types";

const stm = sql.prepare(/* sql */ `
  with "q1" as (
    select
      "Art"."id",
      "Art"."description",
      "Art"."createdAt",
      "User"."discordId",
      "User"."username",
      "User"."discordAvatar",
      "UserSubmittedImage"."url"
    from
      "Art"
    left join "User" on "User"."id" = "Art"."authorId"
    left join "ArtUserMetadata" on "ArtUserMetadata"."artId" = "Art"."id"
    inner join "UserSubmittedImage" on "UserSubmittedImage"."id" = "Art"."imgId"
    where "ArtUserMetadata"."userId" = @userId
      and "Art"."authorId" != @userId

    union all

    select
      "Art"."id",
      "Art"."description",
      "Art"."createdAt",
      null, -- discordId
      null, -- username
      null, -- discordAvatar
      "UserSubmittedImage"."url"
    from
      "Art"
    inner join "UserSubmittedImage" on "UserSubmittedImage"."id" = "Art"."imgId"
    where
      "Art"."authorId" = @userId

    order by "Art"."createdAt" desc
  ),
  "q2" as (
    select
      "q1".*,
      json_group_array("ArtTag"."name") as "tags"
    from
      "q1"
    left join "TaggedArt" on "TaggedArt"."artId" = "q1"."id"
    left join "ArtTag" on "ArtTag"."id" = "TaggedArt"."tagId"
    group by "q1"."id"
  )
  select
    "q2".*,
    json_group_array(
      json_object(
        'discordId', "LinkedUser"."discordId",
        'username', "LinkedUser"."username",
        'customUrl', "LinkedUser"."customUrl"
      )
    ) as "linkedUsers"
  from
    "q2"
  left join "ArtUserMetadata" on "ArtUserMetadata"."artId" = "q2"."id"
  left join "User" as "LinkedUser" on "LinkedUser"."id" = "ArtUserMetadata"."userId"
  group by "q2"."id"
  order by "q2"."createdAt" desc
`);

export function artsByUserId(userId: number): ListedArt[] {
	return stm.all({ userId }).map((a: any) => {
		const tags = parseDBArray(a.tags) as any[];
		const linkedUsers = parseDBJsonArray(a.linkedUsers) as any[];

		return {
			id: a.id,
			url: a.url,
			description: a.description,
			createdAt: a.createdAt,
			tags: tags.length > 0 ? tags : undefined,
			linkedUsers: linkedUsers.length > 0 ? linkedUsers : undefined,
			author: a.discordId
				? {
						commissionsOpen: a.commissionsOpen,
						discordAvatar: a.discordAvatar,
						discordId: a.discordId,
						username: a.username,
					}
				: undefined,
		};
	});
}

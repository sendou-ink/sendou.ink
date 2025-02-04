import { sql } from "~/db/sql";
import type { ArtTag } from "~/db/types";
import type { ListedArt } from "../art-types";

const showcaseArtsStm = sql.prepare(/* sql */ `
  select
    "Art"."id",
    "User"."id" as "userId",
    "User"."discordId",
    "User"."username",
    "User"."discordAvatar",
    "User"."commissionsOpen",
    "UserSubmittedImage"."url"
  from
    "Art"
  left join "User" on "User"."id" = "Art"."authorId"
  inner join "UserSubmittedImage" on "UserSubmittedImage"."id" = "Art"."imgId"
  where
    "Art"."isShowcase" = 1
  order by random()
`);

export function showcaseArts(): ListedArt[] {
	return showcaseArtsStm.all().map((a: any) => ({
		id: a.id,
		createdAt: a.createdAt,
		url: a.url,
		author: {
			commissionsOpen: a.commissionsOpen,
			discordAvatar: a.discordAvatar,
			discordId: a.discordId,
			username: a.username,
		},
	}));
}

const showcaseArtsByTagStm = sql.prepare(/* sql */ `
  select
    "Art"."id",
    "User"."id" as "userId",
    "User"."discordId",
    "User"."username",
    "User"."discordAvatar",
    "User"."commissionsOpen",
    "UserSubmittedImage"."url"
  from
    "TaggedArt"
  inner join "Art" on "Art"."id" = "TaggedArt"."artId"
  left join "User" on "User"."id" = "Art"."authorId"
  inner join "UserSubmittedImage" on "UserSubmittedImage"."id" = "Art"."imgId"
  where 
    "TaggedArt"."tagId" = @tagId
  order by 
    "Art"."isShowcase" desc, random()

`);

export function showcaseArtsByTag(tagId: ArtTag["id"]): ListedArt[] {
	const encounteredUserIds = new Set<number>();

	return showcaseArtsByTagStm
		.all({ tagId })
		.filter((row: any) => {
			if (encounteredUserIds.has(row.userId)) {
				return false;
			}

			encounteredUserIds.add(row.userId);
			return true;
		})
		.map((a: any) => ({
			id: a.id,
			createdAt: a.createdAt,
			url: a.url,
			author: {
				commissionsOpen: a.commissionsOpen,
				discordAvatar: a.discordAvatar,
				discordId: a.discordId,
				username: a.username,
			},
		}));
}

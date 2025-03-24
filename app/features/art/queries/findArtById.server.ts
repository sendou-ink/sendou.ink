import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";
import { parseDBArray } from "~/utils/sql";

const findArtStm = sql.prepare(/* sql */ `
  select 
    "Art"."isShowcase",
    "Art"."description",
    "Art"."authorId",
    "UserSubmittedImage"."url",
    json_group_array("ArtUserMetadata"."userId") as "linkedUsers"
  from "Art"
  left join "ArtUserMetadata" on "Art"."id" = "ArtUserMetadata"."artId"
  inner join "UserSubmittedImage" on "Art"."imgId" = "UserSubmittedImage"."id"
  where "Art"."id" = @artId
  group by "Art"."id"
`);

const findTagsStm = sql.prepare(/* sql */ `
  select
    "ArtTag"."id",
    "ArtTag"."name"
  from "ArtTag"
  inner join "TaggedArt" on "ArtTag"."id" = "TaggedArt"."tagId"
  where "TaggedArt"."artId" = @artId
`);

interface FindArtById {
	isShowcase: Tables["Art"]["isShowcase"];
	description: Tables["Art"]["description"];
	url: Tables["UserSubmittedImage"]["url"];
	authorId: Tables["Art"]["authorId"];
	linkedUsers: Tables["User"]["id"][];
	tags: Array<Pick<Tables["ArtTag"], "id" | "name">>;
}

export function findArtById(artId: number): FindArtById | null {
	const art = findArtStm.get({ artId }) as any;
	if (!art) return null;

	return {
		...art,
		linkedUsers: parseDBArray(art.linkedUsers),
		tags: findTagsStm.all({ artId }),
	};
}

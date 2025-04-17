import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";
import { IMAGES_TO_VALIDATE_AT_ONCE } from "../upload-constants";

const stm = sql.prepare(/* sql */ `
  select
    "UnvalidatedUserSubmittedImage"."id",
    "UnvalidatedUserSubmittedImage"."url",
    "UnvalidatedUserSubmittedImage"."submitterUserId",
    "User"."username"
  from "UnvalidatedUserSubmittedImage"
  left join "User" on
    "UnvalidatedUserSubmittedImage"."submitterUserId" = "User"."id"
  left join "Team" on 
    "UnvalidatedUserSubmittedImage"."id" = "Team"."avatarImgId" or 
    "UnvalidatedUserSubmittedImage"."id" = "Team"."bannerImgId"
  left join "Art" on
    "UnvalidatedUserSubmittedImage"."id" = "Art"."imgId"
  left join "CalendarEvent" on
    "UnvalidatedUserSubmittedImage"."id" = "CalendarEvent"."avatarImgId"
  where "UnvalidatedUserSubmittedImage"."validatedAt" is null
    and ("Team"."id" is not null or "Art"."id" is not null or "CalendarEvent"."id" is not null)
  limit ${IMAGES_TO_VALIDATE_AT_ONCE}
`);

type UnvalidatedImage = Pick<
	Tables["UserSubmittedImage"],
	"id" | "url" | "submitterUserId"
> & {
	username: Tables["User"]["username"];
};

export function unvalidatedImages() {
	return stm.all() as Array<UnvalidatedImage>;
}

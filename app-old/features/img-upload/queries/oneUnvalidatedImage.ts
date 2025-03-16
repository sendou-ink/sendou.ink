import { sql } from "~/db/sql";
import type { UserSubmittedImage } from "~/db/types";

const stm = sql.prepare(/* sql */ `
  select
    "UnvalidatedUserSubmittedImage"."id",
    "UnvalidatedUserSubmittedImage"."url",
    "UnvalidatedUserSubmittedImage"."submitterUserId"
  from "UnvalidatedUserSubmittedImage"
  left join "Team" on 
    "UnvalidatedUserSubmittedImage"."id" = "Team"."avatarImgId" or 
    "UnvalidatedUserSubmittedImage"."id" = "Team"."bannerImgId"
  left join "Art" on
    "UnvalidatedUserSubmittedImage"."id" = "Art"."imgId"
  left join "CalendarEvent" on
    "UnvalidatedUserSubmittedImage"."id" = "CalendarEvent"."avatarImgId"
  where "UnvalidatedUserSubmittedImage"."validatedAt" is null
    and ("Team"."id" is not null or "Art"."id" is not null or "CalendarEvent"."id" is not null)
  limit 1
`);

type UnvalidatedImage = Pick<
	UserSubmittedImage,
	"id" | "url" | "submitterUserId"
>;

export function oneUnvalidatedImage() {
	return stm.get() as UnvalidatedImage | null;
}

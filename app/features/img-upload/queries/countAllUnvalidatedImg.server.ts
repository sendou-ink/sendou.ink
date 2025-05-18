import { sql } from "~/db/sql";

const stm = sql.prepare(/*sql*/ `
  select count(*) as "count" from "UnvalidatedUserSubmittedImage"
  left join "Team" on 
    "UnvalidatedUserSubmittedImage"."id" = "Team"."avatarImgId" or 
    "UnvalidatedUserSubmittedImage"."id" = "Team"."bannerImgId"
  left join "Art" on
    "UnvalidatedUserSubmittedImage"."id" = "Art"."imgId"
  left join "CalendarEvent" on
    "UnvalidatedUserSubmittedImage"."id" = "CalendarEvent"."avatarImgId"
  where "UnvalidatedUserSubmittedImage"."validatedAt" is null
    and ("Team"."id" is not null or "Art"."id" is not null or "CalendarEvent"."id" is not null)
`);

export function countAllUnvalidatedImg() {
	return (stm.get() as any).count as number;
}

import { sql } from "~/db/sql";

const stm = sql.prepare(/*sql*/ `
  select count(*) as "count" 
    from "UnvalidatedUserSubmittedImage"
    inner join "Art" on "Art"."imgId" = "UnvalidatedUserSubmittedImage"."id"
  where 
    "validatedAt" is null
  and
    "Art"."authorId" = @authorId
`);

export function countUnvalidatedArt(authorId: number) {
	return (stm.get({ authorId }) as any).count as number;
}

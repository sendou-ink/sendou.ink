import { sql } from "~/db/sql";

const stm = sql.prepare(/* sql */ `
  select
    "chatCode"
  from "Group"
  where "id" = @id
`);

export function chatCodeByGroupId(id: number) {
	return (stm.get({ id }) as any)?.chatCode as string | undefined;
}

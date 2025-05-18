import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

const stm = sql.prepare(/*sql*/ `
select
  "Tournament"."id",
  "Tournament"."mapPickingStyle",
  "Tournament"."settings",
  "CalendarEvent"."id" as "eventId",
  "CalendarEvent"."name",
  "CalendarEvent"."description",
  "CalendarEvent"."bracketUrl",
  "CalendarEvent"."authorId",
  "CalendarEventDate"."startTime",
  "User"."username",
  "User"."discordId"
  from "Tournament"
    left join "CalendarEvent" on "Tournament"."id" = "CalendarEvent"."tournamentId"
    left join "User" on "CalendarEvent"."authorId" = "User"."id"
    left join "CalendarEventDate" on "CalendarEvent"."id" = "CalendarEventDate"."eventId"
  where "Tournament"."id" = @identifier
  group by "CalendarEvent"."id"
`);

type FindByIdentifierRow = (Pick<
	Tables["CalendarEvent"],
	"bracketUrl" | "name" | "description" | "authorId"
> &
	Pick<Tables["Tournament"], "id" | "mapPickingStyle"> &
	Pick<Tables["User"], "discordId" | "username"> &
	Pick<Tables["CalendarEventDate"], "startTime">) & {
	eventId: Tables["CalendarEvent"]["id"];
} & { settings: string };

export function findByIdentifier(identifier: string | number) {
	const rows = stm.all({ identifier }) as FindByIdentifierRow[];
	if (rows.length === 0) return null;

	const tournament = { ...rows[0], startTime: resolveEarliestStartTime(rows) };

	const { discordId, username, ...rest } = tournament;

	return {
		...rest,
		settings: JSON.parse(
			tournament.settings,
		) as Tables["Tournament"]["settings"],
		author: {
			discordId,
			username,
		},
	};
}

function resolveEarliestStartTime(
	rows: Pick<Tables["CalendarEventDate"], "startTime">[],
) {
	return Math.min(...rows.map((row) => row.startTime));
}

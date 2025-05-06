import type { LoaderFunctionArgs } from "@remix-run/node";
import type { PersistedCalendarEventTag } from "~/db/tables";
import * as CalendarRepository from "../CalendarRepository.server";
import { databaseTimestampToDate } from "~/utils/dates";
import { CALENDAR_PAGE, SENDOU_INK_BASE_URL } from "~/utils/urls";
import {
  loaderFilterSearchParamsSchema,
  loaderTournamentsOnlySearchParamsSchema,
} from "../calendar-schemas";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // allows limiting calendar events to specific tags
  const parsedFilterParams = loaderFilterSearchParamsSchema.safeParse({
    tags: url.searchParams.get("tags"),
  });
  const parsedTournamentsOnlyParams =
    loaderTournamentsOnlySearchParamsSchema.safeParse({
      tournaments: url.searchParams.get("tournaments"),
    });

  const tagsToFilterBy = parsedFilterParams.success
    ? (parsedFilterParams.data.tags as PersistedCalendarEventTag[])
    : [];
  const onlyTournaments = parsedTournamentsOnlyParams.success
    ? Boolean(parsedTournamentsOnlyParams.data.tournaments)
    : false;

  const startTime = new Date();
  const endTime = new Date(startTime);
  // get all events over the next 3 weeks
  endTime.setDate(startTime.getDate() + 21);

  // handle timezone mismatch between server and client
  startTime.setHours(startTime.getHours() - 12);
  endTime.setHours(endTime.getHours() + 12);

  const events = await CalendarRepository.findAllBetweenTwoTimestamps({
    startTime,
    endTime,
    tagsToFilterBy: tagsToFilterBy,
    onlyTournaments: onlyTournaments,
  });

  // iCal doesnt allow calendars with no components
  // https://www.rfc-editor.org/rfc/rfc5545.txt     3.6.
  if (events.length == 0) {
    return new Response(null, { status: 204 });
  }

  const iCalData = eventsAsICal(events);

  return new Response(iCalData, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar",
    },
  });
};

function eventsAsICal(
  events: CalendarRepository.FindAllBetweenTwoTimestampsItem[]
): Buffer {
  const properties =
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//sendou.ink//calendar//EN\r\n";

  const data =
    events.reduce(
      (acc, event) => acc + eventInfoAsICalEvent(event),
      properties
    ) + "END:VCALENDAR\r\n";

  // iCal requires utf-8
  // https://www.rfc-editor.org/rfc/rfc5545.txt     3.1.4
  return Buffer.from(data, "utf8");
}

function eventInfoAsICalEvent(
  event: CalendarRepository.FindAllBetweenTwoTimestampsItem
): string {
  const date = new Date();
  const eventDate = databaseTimestampToDate(event.startTime);
  const eventEndDate = new Date(databaseTimestampToDate(event.startTime));
  eventEndDate.setHours(eventEndDate.getHours() + 3); // arbitrary length of 3 hours
  const eventLink = `${SENDOU_INK_BASE_URL}${CALENDAR_PAGE}/${event.eventId}`;
  const tags = event.tags.reduce((acc, tag) => `${acc},${tag}`, "").slice(1);

  return wrapLines(
    "BEGIN:VEVENT\r\n" +
      `UID:${crypto.randomUUID()}\r\n` +
      `DTSTAMP:${dateAsICalDate(date)}\r\n` +
      `DTSTART:${dateAsICalDate(eventDate)}\r\n` +
      `DTEND:${dateAsICalDate(eventEndDate)}\r\n` +
      `SUMMARY:${event.name}\r\n` +
      `LOCATION:${eventLink}\r\n` +
      `CATEGORIES:${tags}\r\n` +
      `END:VEVENT\r\n`
  );
}

// converts date to iCal utc format yyyymmddThhmmssZ
// https://www.rfc-editor.org/rfc/rfc5545.txt       3.3.5.
function dateAsICalDate(date: Date): string {
  return `${date.getUTCFullYear()}${(date.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}${date.getUTCDate().toString().padStart(2, "0")}T${date
    .getUTCHours()
    .toString()
    .padStart(2, "0")}${date.getUTCMinutes().toString().padStart(2, "0")}${date
    .getUTCSeconds()
    .toString()
    .padStart(2, "0")}Z`;
}

// iCal limits lines to 75 octets, lines longer get split with the next beginning with whitespace
// https://www.rfc-editor.org/rfc/rfc5545.txt       3.1.
function wrapLines(s: string): string {
  const lines = s.split("\r\n");
  return lines.reduce((acc, line) => {
    if (line.length == 0) {
      return acc;
    }
    if (line.length > 75) {
      const [a, b] = [line.substring(0, 75), line.substring(75)];
      return acc + `${a}\r\n\x09` + wrapLines(b); // no need for \r\n, short lines will pass through check and have \r\n appended
    }
    return acc + line + "\r\n";
  }, "");
}

import type { LoaderFunctionArgs } from "@remix-run/node";
import type { PersistedCalendarEventTag } from "~/db/tables";
import * as CalendarRepository from "../CalendarRepository.server";
import { databaseTimestampToDate } from "~/utils/dates";
import {
  loaderFilterSearchParamsSchema,
  loaderTournamentsOnlySearchParamsSchema,
} from "../calendar-schemas";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

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

  const events = CalendarRepository.findAllBetweenTwoTimestamps({
    startTime,
    endTime,
    tagsToFilterBy: tagsToFilterBy,
    onlyTournaments: onlyTournaments,
  });

  // TODO: convert event list to ical
  const iCalFeed = eventsAsICal(await events);
  return new Response(iCalFeed, {
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

  return Buffer.from(data, "utf8");
}

function eventInfoAsICalEvent(
  event: CalendarRepository.FindAllBetweenTwoTimestampsItem
): string {
  const date = new Date();
  const eventDate = databaseTimestampToDate(event.startTime);
  const eventEndDate = new Date(databaseTimestampToDate(event.startTime));
  eventEndDate.setHours(eventEndDate.getHours() + 3); // arbitrary length of 3 hours, maybe change
  const eventLink = `https://sendou.ink/calendar/${event.eventId}`;
  const tags = event.tags.reduce((acc, tag) => `${acc},${tag}`, "").slice(1);

  return (
    "BEGIN:VEVENT\r\n" +
    `UID:${crypto.randomUUID()}\r\n` +
    `DTSTAMP:${dateAsICalDate(date)}\r\n` +
    `DTSTART:${dateAsICalDate(eventDate)}\r\n` +
    `DTEND:${dateAsICalDate(eventEndDate)}\r\n` +
    `SUMMARY:${event.name}\r\n` +
    `LOCATION:${eventLink}\r\n` +
    `ORGANISER:${event.username}\r\n` +
    `CATEGORIES:${tags}\r\n` +
    `END:VEVENT\r\n`
  );
}

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

import type { LoaderFunctionArgs } from "@remix-run/node";
import type { PersistedCalendarEventTag } from "~/db/tables";
import * as CalendarRepository from "../CalendarRepository.server";
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
  return new Response(JSON.stringify(await events), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar",
    },
  });
};

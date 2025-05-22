import type { MetaFunction, SerializeFrom } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Link } from "@remix-run/react/dist/components";
import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { Button, LinkButton } from "~/components/Button";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Image } from "~/components/Image";
import { Main } from "~/components/Main";
import { MapPoolStages } from "~/components/MapPoolSelector";
import { Placement } from "~/components/Placement";
import { Section } from "~/components/Section";
import { Table } from "~/components/Table";
import { useUser } from "~/features/auth/core/user";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { useIsMounted } from "~/hooks/useIsMounted";
import { databaseTimestampToDate } from "~/utils/dates";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	CALENDAR_PAGE,
	calendarEditPage,
	calendarEventPage,
	calendarReportWinnersPage,
	navIconUrl,
	readonlyMapsPage,
	resolveBaseUrl,
	userPage,
} from "~/utils/urls";
import { metaTags } from "../../../utils/remix";
import {
	canDeleteCalendarEvent,
	canEditCalendarEvent,
	canReportCalendarEventWinners,
} from "../calendar-utils";
import { Tags } from "../components/Tags";

import { action } from "../actions/calendar.$id.server";
import { loader } from "../loaders/calendar.$id.server";
export { loader, action };

import "~/styles/calendar-event.css";

export const meta: MetaFunction = (args) => {
	const data = args.data as SerializeFrom<typeof loader>;

	if (!data) return [];

	return metaTags({
		title: data.event.name,
		location: args.location,
		description:
			data.event.description ??
			`Splatoon competitive event hosted on ${resolveBaseUrl(data.event.bracketUrl)}`,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["calendar", "game-misc"],
	breadcrumb: ({ match }) => {
		const data = match.data as SerializeFrom<typeof loader> | undefined;

		if (!data) return [];

		return [
			{
				imgPath: navIconUrl("calendar"),
				href: CALENDAR_PAGE,
				type: "IMAGE",
			},
			{
				text: data.event.name,
				href: calendarEventPage(data.event.eventId),
				type: "TEXT",
			},
		];
	},
};

export default function CalendarEventPage() {
	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const { i18n, t } = useTranslation(["common", "calendar"]);
	const isMounted = useIsMounted();

	return (
		<Main className="stack lg">
			<section className="stack sm">
				<div className="event__times">
					{data.event.startTimes.map((startTime, i) => (
						<React.Fragment key={startTime}>
							<span
								className={clsx("event__day", {
									hidden: data.event.startTimes.length === 1,
								})}
							>
								{t("calendar:day", {
									number: i + 1,
								})}
							</span>
							<time dateTime={databaseTimestampToDate(startTime).toISOString()}>
								{isMounted
									? databaseTimestampToDate(startTime).toLocaleDateString(
											i18n.language,
											{
												hour: "numeric",
												minute: "numeric",
												day: "numeric",
												month: "long",
												weekday: "long",
												year: "numeric",
											},
										)
									: null}
							</time>
						</React.Fragment>
					))}
				</div>
				<div className="stack md">
					<div className="stack xs">
						<h2>{data.event.name}</h2>
						<Tags tags={data.event.tags} />
					</div>
					<div className="stack horizontal sm flex-wrap">
						{data.event.discordUrl ? (
							<LinkButton
								to={data.event.discordUrl}
								variant="outlined"
								size="tiny"
								isExternal
							>
								Discord
							</LinkButton>
						) : null}
						<LinkButton
							to={data.event.bracketUrl}
							variant="outlined"
							size="tiny"
							isExternal
						>
							{resolveBaseUrl(data.event.bracketUrl)}
						</LinkButton>
						{canEditCalendarEvent({ user, event: data.event }) && (
							<LinkButton size="tiny" to={calendarEditPage(data.event.eventId)}>
								{t("common:actions.edit")}
							</LinkButton>
						)}
						{canReportCalendarEventWinners({
							user,
							event: data.event,
							startTimes: data.event.startTimes,
						}) && (
							<LinkButton
								size="tiny"
								to={calendarReportWinnersPage(data.event.eventId)}
							>
								{t("calendar:actions.reportWinners")}
							</LinkButton>
						)}
					</div>
				</div>
			</section>
			<Results />
			<MapPoolInfo />
			<div className="stack md">
				<Description />
				{canDeleteCalendarEvent({
					user,
					startTime: databaseTimestampToDate(data.event.startTimes[0]),
					event: data.event,
				}) ? (
					<FormWithConfirm
						dialogHeading={t("calendar:actions.delete.confirm", {
							name: data.event.name,
						})}
					>
						<Button
							className="ml-auto"
							size="tiny"
							variant="minimal-destructive"
							type="submit"
						>
							{t("calendar:actions.delete")}
						</Button>
					</FormWithConfirm>
				) : null}
			</div>
		</Main>
	);
}

function Results() {
	const { t } = useTranslation(["common", "calendar"]);
	const data = useLoaderData<typeof loader>();

	if (!data.results.length) return null;

	const isTeamResults = data.results.some(
		(result) => result.players.length > 1,
	);

	return (
		<Section title={t("calendar:results")} className="event__results-section">
			{data.event.participantCount && (
				<div className="event__results-participant-count">
					{isTeamResults
						? t("calendar:participatedCount", {
								count: data.event.participantCount,
							})
						: t("calendar:participatedPlayerCount", {
								count: data.event.participantCount,
							})}
				</div>
			)}
			<Table>
				<thead>
					<tr>
						<th>{t("calendar:forms.team.placing")}</th>
						<th>{t("common:forms.name")}</th>
						<th>{t("calendar:members")}</th>
					</tr>
				</thead>
				<tbody>
					{data.results.map((result, i) => (
						<tr key={i}>
							<td className="pl-4">
								<Placement placement={result.placement} />
							</td>
							<td>{result.teamName}</td>
							<td>
								<ul className="event__results-players">
									{result.players.map((player) => {
										return (
											<li
												key={player.name ? player.name : player.id}
												className="flex items-center"
											>
												{player.name ? (
													player.name
												) : (
													// as any but we know it's a user since it doesn't have name
													<Link
														to={userPage(player as any)}
														className="stack horizontal xs items-center"
													>
														<Avatar user={player as any} size="xxs" />{" "}
														{player.username}
													</Link>
												)}
											</li>
										);
									})}
								</ul>
							</td>
						</tr>
					))}
				</tbody>
			</Table>
		</Section>
	);
}

function MapPoolInfo() {
	const { t } = useTranslation(["calendar"]);
	const data = useLoaderData<typeof loader>();

	if (!data.event.mapPool || data.event.mapPool.length === 0) return null;

	return (
		<Section title={t("calendar:forms.mapPool")}>
			<div className="event__map-pool-section">
				<MapPoolStages mapPool={new MapPool(data.event.mapPool)} />
				<LinkButton
					className="event__create-map-list-link"
					to={readonlyMapsPage(data.event.eventId)}
					variant="outlined"
					size="tiny"
				>
					<Image alt="" path={navIconUrl("maps")} width={22} height={22} />
					{t("calendar:createMapList")}
				</LinkButton>
			</div>
		</Section>
	);
}

function Description() {
	const { t } = useTranslation();
	const data = useLoaderData<typeof loader>();

	return (
		<Section title={t("forms.description")}>
			<div className="stack sm">
				<div className="event__author">
					<Avatar user={data.event} size="xs" />
					{data.event.username}
				</div>
				{data.event.description && (
					<div className="whitespace-pre-wrap">{data.event.description}</div>
				)}
			</div>
		</Section>
	);
}

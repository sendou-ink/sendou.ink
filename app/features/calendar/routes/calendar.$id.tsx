import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { Avatar } from "~/components/Avatar";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Image } from "~/components/Image";
import { LocaleTime } from "~/components/LocaleTime";
import { Main } from "~/components/Main";
import { MapPoolStages } from "~/components/MapPoolSelector";
import { Placement } from "~/components/Placement";
import { Section } from "~/components/Section";
import { Table } from "~/components/Table";
import { UserLink } from "~/components/UserLink";
import { calendarEditPage } from "~/features/calendar/calendar-urls";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { mapsPageWithMapPool } from "~/features/map-list-generator/map-list-generator-urls";
import { useHasPermission } from "~/modules/permissions/hooks";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	CALENDAR_PAGE,
	calendarEventPage,
	calendarReportWinnersPage,
	navIconUrl,
	resolveBaseUrl,
} from "~/utils/urls";
import {
	metaTags,
	ogPageImage,
	type SerializeFrom,
} from "../../../utils/remix";
import { action } from "../actions/calendar.$id.server";
import styles from "../calendar-event.module.css";
import { Tags } from "../components/Tags";
import { loader } from "../loaders/calendar.$id.server";

export { action, loader };

export const meta: MetaFunction = (args) => {
	const data = args.loaderData as SerializeFrom<typeof loader>;

	if (!data) return [];

	return metaTags({
		title: data.event.name,
		image: ogPageImage("calendar"),
		location: args.location,
		description:
			data.event.description ??
			`Splatoon competitive event hosted on ${resolveBaseUrl(data.event.bracketUrl)}`,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["calendar", "game-misc"],
	breadcrumb: ({ match }) => {
		const data = match.loaderData as SerializeFrom<typeof loader> | undefined;

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
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["common", "calendar"]);
	const canEdit = useHasPermission(data.event, "EDIT");
	const canReportWinners = useHasPermission(data.event, "REPORT_WINNERS");
	const canDelete = useHasPermission(data.event, "DELETE");

	return (
		<Main className="stack lg">
			<section className="stack sm">
				<div className={styles.times}>
					{data.event.startTimes.map((startTime, i) => (
						<React.Fragment key={startTime}>
							<span
								className={clsx(styles.day, {
									hidden: data.event.startTimes.length === 1,
								})}
							>
								{t("calendar:day", {
									number: i + 1,
								})}
							</span>
							<LocaleTime
								date={startTime}
								options={{
									hour: "numeric",
									minute: "numeric",
									day: "numeric",
									month: "numeric",
									weekday: "long",
									year: "numeric",
								}}
							/>
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
								size="small"
								isExternal
							>
								Discord
							</LinkButton>
						) : null}
						<LinkButton
							to={data.event.bracketUrl}
							variant="outlined"
							size="small"
							isExternal
						>
							{resolveBaseUrl(data.event.bracketUrl)}
						</LinkButton>
						{canEdit ? (
							<LinkButton
								size="small"
								to={calendarEditPage(data.event.eventId)}
							>
								{t("common:actions.edit")}
							</LinkButton>
						) : null}
						{canReportWinners ? (
							<LinkButton
								size="small"
								to={calendarReportWinnersPage(data.event.eventId)}
							>
								{t("calendar:actions.reportWinners")}
							</LinkButton>
						) : null}
					</div>
				</div>
			</section>
			<Results />
			<MapPoolInfo />
			<div className="stack md">
				<Description />
				{canDelete ? (
					<FormWithConfirm
						dialogHeading={t("calendar:actions.delete.confirm", {
							name: data.event.name,
						})}
					>
						<SendouButton
							className="ml-auto"
							size="small"
							variant="minimal-destructive"
							type="submit"
						>
							{t("calendar:actions.delete")}
						</SendouButton>
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
		<Section title={t("calendar:results")} className={styles.resultsSection}>
			{data.event.participantCount && (
				<div className={styles.resultsParticipantCount}>
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
								<ul className={styles.resultsPlayers}>
									{result.players.map((player) => {
										return (
											<li
												key={player.name ? player.name : player.id}
												className="flex items-center"
											>
												<UserLink user={player} />
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

	const mapPool = new MapPool(data.event.mapPool);

	return (
		<Section title={t("calendar:forms.mapPool")}>
			<div className={styles.mapPoolSection}>
				<MapPoolStages mapPool={mapPool} />
				<LinkButton
					className={styles.createMapListLink}
					to={mapsPageWithMapPool(mapPool)}
					variant="outlined"
					size="small"
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
				<div className={styles.author}>
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

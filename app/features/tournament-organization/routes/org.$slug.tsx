import type { MetaFunction, SerializeFrom } from "@remix-run/node";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { LinkButton } from "~/components/Button";
import { Divider } from "~/components/Divider";
import { Main } from "~/components/Main";
import { NewTabs } from "~/components/NewTabs";
import { Pagination } from "~/components/Pagination";
import { Placement } from "~/components/Placement";
import { EditIcon } from "~/components/icons/Edit";
import { useUser } from "~/features/auth/core/user";
import { BadgeDisplay } from "~/features/badges/components/BadgeDisplay";
import { useIsMounted } from "~/hooks/useIsMounted";
import { databaseTimestampNow, databaseTimestampToDate } from "~/utils/dates";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { makeTitle } from "~/utils/strings";
import {
	BLANK_IMAGE_URL,
	calendarEventPage,
	tournamentOrganizationEditPage,
	tournamentOrganizationPage,
	tournamentPage,
	userPage,
	userSubmittedImage,
} from "~/utils/urls";
import { EventCalendar } from "../components/EventCalendar";
import { SocialLinksList } from "../components/SocialLinksList";
import { TOURNAMENT_SERIES_EVENTS_PER_PAGE } from "../tournament-organization-constants";
import { canEditTournamentOrganization } from "../tournament-organization-utils";

import "../tournament-organization.css";

import { loader } from "../loaders/org.$slug.server";
export { loader };

export const meta: MetaFunction = (args) => {
	const data = args.data as SerializeFrom<typeof loader>;

	if (!data) return [];

	const title = makeTitle(data.organization.name);

	return [
		{ title },
		{
			property: "og:title",
			content: title,
		},
		{
			property: "og:description",
			content: data.organization.description,
		},
		{
			property: "og:type",
			content: "website",
		},
		{
			property: "og:image",
			content: data.organization.avatarUrl
				? userSubmittedImage(data.organization.avatarUrl)
				: undefined,
		},
		{
			name: "twitter:card",
			content: "summary",
		},
		{
			name: "twitter:title",
			content: title,
		},
	];
};

export const handle: SendouRouteHandle = {
	i18n: ["badges", "org"],
	breadcrumb: ({ match }) => {
		const data = match.data as SerializeFrom<typeof loader> | undefined;

		if (!data) return [];

		return [
			data.organization.avatarUrl
				? {
						imgPath: userSubmittedImage(data.organization.avatarUrl),
						href: tournamentOrganizationPage({
							organizationSlug: data.organization.slug,
						}),
						type: "IMAGE",
						text: data.organization.name,
						rounded: true,
					}
				: {
						type: "TEXT",
						href: tournamentOrganizationPage({
							organizationSlug: data.organization.slug,
						}),
						text: data.organization.name,
					},
		];
	},
};

export default function TournamentOrganizationPage() {
	const data = useLoaderData<typeof loader>();

	return (
		<Main className="stack lg">
			<LogoHeader />
			<InfoTabs />
			{data.organization.series.length > 0 ? (
				<SeriesSelector series={data.organization.series} />
			) : null}
			{data.series ? (
				<SeriesView series={data.series} />
			) : (
				<AllTournamentsView />
			)}
		</Main>
	);
}

function LogoHeader() {
	const { t } = useTranslation(["common"]);
	const user = useUser();
	const data = useLoaderData<typeof loader>();

	return (
		<div className="stack horizontal md">
			<Avatar
				size="lg"
				url={
					data.organization.avatarUrl
						? userSubmittedImage(data.organization.avatarUrl)
						: undefined
				}
			/>
			<div className="stack sm">
				<div className="text-xl font-bold">{data.organization.name}</div>
				{canEditTournamentOrganization({
					user,
					organization: data.organization,
				}) ? (
					<div className="stack items-start">
						<LinkButton
							to={tournamentOrganizationEditPage(data.organization.slug)}
							icon={<EditIcon />}
							size="tiny"
							variant="outlined"
						>
							{t("common:actions.edit")}
						</LinkButton>
					</div>
				) : null}
				<div className="whitespace-pre-wrap text-sm text-lighter">
					{data.organization.description}
				</div>
			</div>
		</div>
	);
}

function InfoTabs() {
	const { t } = useTranslation(["org"]);
	const data = useLoaderData<typeof loader>();

	return (
		<div>
			<NewTabs
				tabs={[
					{
						label: t("org:edit.form.socialLinks.title"),
						disabled:
							!data.organization.socials ||
							data.organization.socials.length === 0,
					},
					{
						label: t("org:edit.form.members.title"),
					},
					{
						label: t("org:edit.form.badges.title"),
						disabled: data.organization.badges.length === 0,
					},
				]}
				content={[
					{
						element: (
							<SocialLinksList links={data.organization.socials ?? []} />
						),
						key: "socials",
					},
					{
						element: <MembersList />,
						key: "members",
					},
					{
						element: <BadgeDisplay badges={data.organization.badges} />,
						key: "badges",
					},
				]}
			/>
		</div>
	);
}

function MembersList() {
	const { t } = useTranslation(["org"]);
	const data = useLoaderData<typeof loader>();

	return (
		<div className="stack sm text-sm">
			{data.organization.members.map((member) => {
				return (
					<Link
						key={member.id}
						to={userPage(member)}
						className="stack horizontal xs items-center text-main-forced w-max"
					>
						<Avatar user={member} size="xs" />
						<div>
							<div>{member.username}</div>
							<div className="text-lighter text-xs">
								{member.roleDisplayName ?? t(`org:roles.${member.role}`)}
							</div>
						</div>
					</Link>
				);
			})}
		</div>
	);
}

function AllTournamentsView() {
	const data = useLoaderData<typeof loader>();

	return (
		<div className="org__events-container">
			<EventCalendar
				month={data.month}
				year={data.year}
				events={data.events}
				fallbackLogoUrl={
					data.organization.avatarUrl
						? userSubmittedImage(data.organization.avatarUrl)
						: BLANK_IMAGE_URL
				}
			/>
			<EventsList filteredByMonth />
		</div>
	);
}

function SeriesView({
	series,
}: {
	series: NonNullable<SerializeFrom<typeof loader>["series"]>;
}) {
	const { t } = useTranslation(["org"]);

	return (
		<div className="stack md">
			<SeriesHeader series={series} />
			<div>
				<NewTabs
					disappearing
					tabs={[
						{
							label: t("org:events.tabs.events"),
							number: series.eventsCount,
						},
						{
							label: t("org:events.tabs.leaderboard"),
							disabled: !series.leaderboard,
						},
					]}
					content={[
						{
							key: "events",
							element: (
								<div className="stack lg">
									<EventsList showYear />
									<EventsPagination series={series} />
								</div>
							),
						},
						{
							key: "leaderboard",
							element: series.leaderboard && (
								<EventLeaderboard
									leaderboard={series.leaderboard}
									ownEntry={series.ownEntry}
								/>
							),
						},
					]}
				/>
			</div>
		</div>
	);
}

function SeriesHeader({
	series,
}: {
	series: NonNullable<SerializeFrom<typeof loader>["series"]>;
}) {
	const { i18n, t } = useTranslation(["org"]);

	return (
		<div className="stack md">
			<div className="stack horizontal md items-center">
				{series.logoUrl ? (
					<img
						alt=""
						src={series.logoUrl}
						width={64}
						height={64}
						className="rounded-full"
					/>
				) : null}
				<div>
					<h2 className="text-lg">{series.name}</h2>
					{series.established ? (
						<div className="text-lighter text-italic text-xs">
							{t("org:events.established.short")}{" "}
							{databaseTimestampToDate(series.established).toLocaleDateString(
								i18n.language,
								{
									month: "long",
									year: "numeric",
								},
							)}
						</div>
					) : null}
				</div>
			</div>
			<div className="text-sm whitespace-pre-wrap">{series.description}</div>
		</div>
	);
}

function SeriesSelector({
	series,
}: {
	series: SerializeFrom<typeof loader>["organization"]["series"];
}) {
	const { t } = useTranslation(["org"]);

	return (
		<div className="stack horizontal md flex-wrap">
			<SeriesButton>{t("org:events.all")}</SeriesButton>
			{series.map((series) => (
				<SeriesButton key={series.id} seriesId={series.id}>
					{series.name}
				</SeriesButton>
			))}
		</div>
	);
}

function SeriesButton({
	children,
	seriesId,
}: {
	children: React.ReactNode;
	seriesId?: number;
}) {
	return (
		<LinkButton
			variant="minimal"
			size="tiny"
			to={`?series=${seriesId ?? "all"}`}
		>
			{children}
		</LinkButton>
	);
}

function EventsList({
	showYear,
	filteredByMonth,
}: { showYear?: boolean; filteredByMonth?: boolean }) {
	const { t } = useTranslation(["org"]);
	const data = useLoaderData<typeof loader>();
	const isMounted = useIsMounted();

	if (!isMounted) return null;

	const now = databaseTimestampNow();

	const events = filteredByMonth
		? data.events.filter(
				(event) =>
					databaseTimestampToDate(event.startTime).getMonth() === data.month,
			)
		: data.events;
	const pastEvents = events.filter((event) => event.startTime < now);
	const upcomingEvents = events.filter((event) => event.startTime >= now);

	return (
		<div className="w-full stack xs">
			{upcomingEvents.length > 0 ? (
				<SectionDivider>{t("org:events.upcoming")}</SectionDivider>
			) : null}
			<div className="stack md">
				{upcomingEvents.map((event) => (
					<EventInfo key={event.eventId} event={event} showYear={showYear} />
				))}
			</div>
			{pastEvents.length > 0 ? (
				<SectionDivider>{t("org:events.past")}</SectionDivider>
			) : null}
			<div className="stack md">
				{pastEvents.map((event) => (
					<EventInfo key={event.eventId} event={event} showYear={showYear} />
				))}
			</div>
		</div>
	);
}

function SectionDivider({ children }: { children: React.ReactNode }) {
	return <div className="org__section-divider">{children}</div>;
}

function EventInfo({
	event,
	showYear,
}: {
	event: SerializeFrom<typeof loader>["events"][number];
	showYear?: boolean;
}) {
	const { i18n } = useTranslation();

	return (
		<div className="stack sm">
			<Link
				to={
					event.tournamentId
						? tournamentPage(event.tournamentId)
						: calendarEventPage(event.eventId)
				}
				className="org__event-info"
			>
				{event.logoUrl ? (
					<img src={event.logoUrl} alt={event.name} width={38} height={38} />
				) : null}
				<div>
					<div className="org__event-info__name">{event.name}</div>
					<time className="org__event-info__time" suppressHydrationWarning>
						{databaseTimestampToDate(event.startTime).toLocaleString(
							i18n.language,
							{
								day: "numeric",
								month: "numeric",
								hour: "numeric",
								minute: "numeric",
								year: showYear ? "numeric" : undefined,
							},
						)}
					</time>
				</div>
			</Link>
			{event.tournamentWinners || event.eventWinners ? (
				<EventWinners winner={event.tournamentWinners ?? event.eventWinners!} />
			) : null}
		</div>
	);
}

function EventWinners({
	winner,
}: {
	winner: NonNullable<
		| SerializeFrom<typeof loader>["events"][number]["tournamentWinners"]
		| SerializeFrom<typeof loader>["events"][number]["eventWinners"]
	>;
}) {
	return (
		<div className="stack xs">
			<div className="stack horizontal sm items-center font-semi-bold">
				<Placement placement={1} size={24} />
				{winner.avatarUrl ? (
					<img
						src={userSubmittedImage(winner.avatarUrl)}
						alt=""
						width={24}
						height={24}
						className="rounded-full"
					/>
				) : null}
				{winner.name}
			</div>
			<div className="stack xs horizontal">
				{winner.members.map((member) => (
					<Avatar key={member.discordId} user={member} size="xxs" />
				))}
			</div>
		</div>
	);
}

function EventsPagination({
	series,
}: {
	series: NonNullable<SerializeFrom<typeof loader>["series"]>;
}) {
	if (!series.eventsCount) return null;

	const pagesCount = Math.ceil(
		series.eventsCount / TOURNAMENT_SERIES_EVENTS_PER_PAGE,
	);

	if (pagesCount <= 1) return null;

	const [, setSearchParams] = useSearchParams();

	const setPage = (page: number) =>
		setSearchParams((prev) => {
			prev.set("page", String(page));

			return prev;
		});

	return (
		<Pagination
			currentPage={series.page}
			nextPage={() => setPage(series.page + 1)}
			pagesCount={pagesCount}
			previousPage={() => setPage(series.page - 1)}
			setPage={setPage}
		/>
	);
}

function EventLeaderboard({
	leaderboard,
	ownEntry,
}: {
	leaderboard: NonNullable<
		NonNullable<SerializeFrom<typeof loader>["series"]>["leaderboard"]
	>;
	ownEntry?: NonNullable<SerializeFrom<typeof loader>["series"]>["ownEntry"];
}) {
	return (
		<div className="stack md">
			{ownEntry ? (
				<>
					<ol className="org__leaderboard-list" start={ownEntry.placement}>
						<li>
							<EventLeaderboardRow entry={ownEntry.entry} />
						</li>
					</ol>
					<Divider />
				</>
			) : null}
			<ol className="org__leaderboard-list">
				{leaderboard.map((entry) => (
					<li key={entry.user.discordId}>
						<EventLeaderboardRow entry={entry} />
					</li>
				))}
			</ol>
		</div>
	);
}

function EventLeaderboardRow({
	entry,
}: {
	entry: NonNullable<
		NonNullable<SerializeFrom<typeof loader>["series"]>["leaderboard"]
	>[number];
}) {
	return (
		<div className="org__leaderboard-list__row">
			<Link
				to={userPage(entry.user)}
				className="stack horizontal sm items-center font-semi-bold text-main-forced"
			>
				<Avatar size="xs" user={entry.user} />
				{entry.user.username}
			</Link>
			<div className="stack sm horizontal items-center text-lighter font-semi-bold">
				<span className="text-main-forced">{entry.points}p</span>{" "}
				<Placement placement={1} /> ×{entry.placements.first}
				<Placement placement={2} /> ×{entry.placements.second}
				<Placement placement={3} /> ×{entry.placements.third}
			</div>
		</div>
	);
}

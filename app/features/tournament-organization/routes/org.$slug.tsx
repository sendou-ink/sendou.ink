import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { Avatar } from "~/components/Avatar";
import { Divider } from "~/components/Divider";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Image } from "~/components/Image";
import { EditIcon } from "~/components/icons/Edit";
import { LinkIcon } from "~/components/icons/Link";
import { LockIcon } from "~/components/icons/Lock";
import { UsersIcon } from "~/components/icons/Users";
import { Main } from "~/components/Main";
import { Pagination } from "~/components/Pagination";
import { Placement } from "~/components/Placement";
import { TierPill } from "~/components/TierPill";
import { BadgeDisplay } from "~/features/badges/components/BadgeDisplay";
import { BannedUsersList } from "~/features/tournament-organization/components/BannedPlayersList";
import { SendouForm } from "~/form/SendouForm";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import { useHasPermission, useHasRole } from "~/modules/permissions/hooks";
import { databaseTimestampNow, databaseTimestampToDate } from "~/utils/dates";
import { metaTags, type SerializeFrom } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	BLANK_IMAGE_URL,
	calendarEventPage,
	navIconUrl,
	tournamentOrganizationEditPage,
	tournamentOrganizationPage,
	tournamentPage,
	userPage,
} from "~/utils/urls";
import { action } from "../actions/org.$slug.server";
import { EventCalendar } from "../components/EventCalendar";
import { SocialLinksList } from "../components/SocialLinksList";
import { loader } from "../loaders/org.$slug.server";
import { TOURNAMENT_SERIES_EVENTS_PER_PAGE } from "../tournament-organization-constants";
import { updateIsEstablishedSchema } from "../tournament-organization-schemas";
export { action, loader };

import "../tournament-organization.css";

export const meta: MetaFunction<typeof loader> = (args) => {
	if (!args.data) return [];

	return metaTags({
		title: args.data.organization.name,
		location: args.location,
		description: args.data.organization.description ?? undefined,
		image: args.data.organization.avatarUrl
			? {
					url: args.data.organization.avatarUrl,
					dimensions: { width: 124, height: 124 },
				}
			: undefined,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["badges", "org"],
	breadcrumb: ({ match }) => {
		const data = match.data as SerializeFrom<typeof loader> | undefined;

		if (!data) return [];

		return [
			data.organization.avatarUrl
				? {
						imgPath: data.organization.avatarUrl,
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
	const data = useLoaderData<typeof loader>();
	const canEditOrganization = useHasPermission(data.organization, "EDIT");

	return (
		<div className="stack horizontal md">
			<Avatar size="lg" url={data.organization.avatarUrl ?? undefined} />
			<div className="stack sm">
				<div className="text-xl font-bold">{data.organization.name}</div>
				{canEditOrganization ? (
					<div className="stack items-start">
						<LinkButton
							to={tournamentOrganizationEditPage(data.organization.slug)}
							icon={<EditIcon />}
							size="small"
							variant="outlined"
							testId="edit-org-button"
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
	const isAdmin = useHasRole("ADMIN");
	const canBanPlayers = useHasPermission(data.organization, "BAN");

	const hasSocials =
		data.organization.socials && data.organization.socials.length > 0;
	const hasBadges = data.organization.badges.length > 0;

	return (
		<div>
			<SendouTabs>
				<SendouTabList>
					<SendouTab id="socials" isDisabled={!hasSocials} icon={<LinkIcon />}>
						{t("org:edit.form.socialLinks.title")}
					</SendouTab>
					<SendouTab id="members" icon={<UsersIcon />}>
						{t("org:edit.form.members.title")}
					</SendouTab>
					<SendouTab
						id="badges"
						isDisabled={!hasBadges}
						icon={<Image path={navIconUrl("badges")} alt="" width={16} />}
					>
						{t("org:edit.form.badges.title")}
					</SendouTab>
					{canBanPlayers && data.bannedUsers ? (
						<SendouTab
							id="banned-users"
							icon={<LockIcon />}
							data-testid="banned-users-tab"
						>
							{t("org:banned.title")}
						</SendouTab>
					) : null}
					{isAdmin ? (
						<SendouTab id="admin" icon={<LockIcon />}>
							Admin
						</SendouTab>
					) : null}
				</SendouTabList>
				<SendouTabPanel id="socials">
					<SocialLinksList links={data.organization.socials ?? []} />
				</SendouTabPanel>
				<SendouTabPanel id="members">
					<MembersList />
				</SendouTabPanel>
				<SendouTabPanel id="badges">
					<BadgeDisplay badges={data.organization.badges} />
				</SendouTabPanel>
				{data.bannedUsers ? (
					<SendouTabPanel id="banned-users">
						<BannedUsersList bannedUsers={data.bannedUsers} />
					</SendouTabPanel>
				) : null}
				{isAdmin ? (
					<SendouTabPanel id="admin">
						<AdminControls />
					</SendouTabPanel>
				) : null}
			</SendouTabs>
		</div>
	);
}

function AdminControls() {
	const data = useLoaderData<typeof loader>();

	return (
		<div className="stack sm">
			<SendouForm
				className=""
				schema={updateIsEstablishedSchema}
				defaultValues={{
					isEstablished: Boolean(data.organization.isEstablished),
				}}
				autoSubmit
			>
				{({ FormField }) => <FormField name="isEstablished" />}
			</SendouForm>
			<FormWithConfirm
				dialogHeading={`Delete organization "${data.organization.name}"?`}
				fields={[["_action", "DELETE_ORGANIZATION"]]}
			>
				<SendouButton variant="minimal-destructive">
					Delete organization
				</SendouButton>
			</FormWithConfirm>
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
						? data.organization.avatarUrl
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

	const hasLeaderboard = Boolean(series.leaderboard);

	return (
		<div className="stack md">
			<SeriesHeader series={series} />
			<div>
				<SendouTabs>
					<SendouTabList>
						<SendouTab id="events" number={series.eventsCount}>
							{t("org:events.tabs.events")}
						</SendouTab>
						<SendouTab id="leaderboard" isDisabled={!hasLeaderboard}>
							{t("org:events.tabs.leaderboard")}
						</SendouTab>
					</SendouTabList>
					<SendouTabPanel id="events">
						<div className="stack lg">
							<EventsList showYear />
							<EventsPagination series={series} />
						</div>
					</SendouTabPanel>
					<SendouTabPanel id="leaderboard">
						{hasLeaderboard && (
							<EventLeaderboard
								leaderboard={series.leaderboard!}
								ownEntry={series.ownEntry}
							/>
						)}
					</SendouTabPanel>
				</SendouTabs>
			</div>
		</div>
	);
}

function SeriesHeader({
	series,
}: {
	series: NonNullable<SerializeFrom<typeof loader>["series"]>;
}) {
	const { t } = useTranslation(["org"]);
	const { formatDate } = useTimeFormat();

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
					<div className="stack horizontal sm items-center">
						<h2 className="text-lg">{series.name}</h2>
						{series.tentativeTier ? (
							<TierPill tier={series.tentativeTier} />
						) : null}
					</div>
					{series.established ? (
						<div className="text-lighter text-italic text-xs">
							{t("org:events.established.short")}{" "}
							{formatDate(databaseTimestampToDate(series.established), {
								month: "long",
								year: "numeric",
							})}
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
			size="small"
			to={`?series=${seriesId ?? "all"}`}
		>
			{children}
		</LinkButton>
	);
}

function EventsList({
	showYear,
	filteredByMonth,
}: {
	showYear?: boolean;
	filteredByMonth?: boolean;
}) {
	const { t } = useTranslation(["org"]);
	const data = useLoaderData<typeof loader>();

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
	const { formatDateTime } = useTimeFormat();

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
						{formatDateTime(databaseTimestampToDate(event.startTime), {
							day: "numeric",
							month: "numeric",
							hour: "numeric",
							minute: "numeric",
							year: showYear ? "numeric" : undefined,
						})}
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
						src={winner.avatarUrl}
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
	const [, setSearchParams] = useSearchParams();

	if (!series.eventsCount) return null;

	const pagesCount = Math.ceil(
		series.eventsCount / TOURNAMENT_SERIES_EVENTS_PER_PAGE,
	);

	if (pagesCount <= 1) return null;

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

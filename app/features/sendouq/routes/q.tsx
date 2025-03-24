import type { MetaFunction, SerializeFrom } from "@remix-run/node";
import { Link, useFetcher, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "~/components/Alert";
import { Button, LinkButton } from "~/components/Button";
import { Dialog } from "~/components/Dialog";
import { Flag } from "~/components/Flag";
import { FormMessage } from "~/components/FormMessage";
import { FriendCodeInput } from "~/components/FriendCodeInput";
import { Image } from "~/components/Image";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { UserIcon } from "~/components/icons/User";
import { UsersIcon } from "~/components/icons/Users";
import type { Tables } from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import type { RankingSeason } from "~/features/mmr/season";
import { useAutoRerender } from "~/hooks/useAutoRerender";
import { useIsMounted } from "~/hooks/useIsMounted";
import { joinListToNaturalString } from "~/utils/arrays";
import invariant from "~/utils/invariant";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	LEADERBOARDS_PAGE,
	LOG_IN_URL,
	SENDOUQ_INFO_PAGE,
	SENDOUQ_LOOKING_PREVIEW_PAGE,
	SENDOUQ_PAGE,
	SENDOUQ_RULES_PAGE,
	SENDOUQ_SETTINGS_PAGE,
	SENDOUQ_STREAMS_PAGE,
	navIconUrl,
	userSeasonsPage,
} from "~/utils/urls";
import { isAtLeastFiveDollarTierPatreon } from "~/utils/users";
import { SendouButton } from "../../../components/elements/Button";
import { SendouPopover } from "../../../components/elements/Popover";
import { FULL_GROUP_SIZE } from "../q-constants";
import { userCanJoinQueueAt } from "../q-utils";

import { action } from "../actions/q.server";
import { loader } from "../loaders/q.server";
export { loader, action };

import "../q.css";

export const handle: SendouRouteHandle = {
	i18n: ["q"],
	breadcrumb: () => ({
		imgPath: navIconUrl("sendouq"),
		href: SENDOUQ_PAGE,
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "SendouQ",
		description:
			"Splatoon 3 competitive ladder. Join by yourself or with your team and play ranked matches.",
		location: args.location,
	});
};

export default function QPage() {
	const { t } = useTranslation(["q"]);
	const [dialogOpen, setDialogOpen] = React.useState(true);
	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const fetcher = useFetcher();

	const queueJoinStatus =
		user && data.friendCode ? userCanJoinQueueAt(user, data.friendCode) : null;

	return (
		<Main halfWidth className="stack lg">
			<div className="stack md">
				{data.season ? (
					<ActiveSeasonInfo season={data.season} />
				) : data.upcomingSeason ? (
					<UpcomingSeasonInfo season={data.upcomingSeason} />
				) : (
					<NoUpcomingSeasonInfo />
				)}
				<Clocks />
			</div>
			{data.season ? (
				<>
					{data.groupInvitedTo === null ? (
						<Alert variation="WARNING">{t("q:front.inviteCodeWrong")}</Alert>
					) : null}
					{!data.friendCode &&
					data.groupInvitedTo &&
					data.groupInvitedTo.members.length < FULL_GROUP_SIZE ? (
						<Alert variation="WARNING">{t("q:front.noFriendCode")}</Alert>
					) : null}
					{queueJoinStatus === "NOW" &&
					data.groupInvitedTo &&
					data.groupInvitedTo.members.length < FULL_GROUP_SIZE ? (
						<JoinTeamDialog
							open={dialogOpen}
							close={() => setDialogOpen(false)}
							members={data.groupInvitedTo.members}
						/>
					) : null}
					{user ? (
						<FriendCodeInput friendCode={data.friendCode?.friendCode} />
					) : null}
					{user ? (
						<>
							<fetcher.Form className="stack md" method="post">
								<input type="hidden" name="_action" value="JOIN_QUEUE" />
								<div className="stack horizontal md items-center mt-4 mx-auto">
									<SubmitButton
										icon={<UsersIcon />}
										disabled={queueJoinStatus !== "NOW"}
									>
										{t("q:front.actions.joinWithGroup")}
									</SubmitButton>
									<SubmitButton
										name="direct"
										value="true"
										state={fetcher.state}
										icon={<UserIcon />}
										variant="outlined"
										disabled={queueJoinStatus !== "NOW"}
									>
										{t("q:front.actions.joinSolo")}
									</SubmitButton>
								</div>
								{queueJoinStatus instanceof Date ? (
									<div
										className="text-lighter text-xs text-center text-warning"
										suppressHydrationWarning
									>
										As a fresh account please wait before joining the queue. You
										can join{" "}
										{queueJoinStatus.toLocaleString("en-US", {
											day: "numeric",
											month: "long",
											hour: "numeric",
											minute: "numeric",
										})}
									</div>
								) : !data.friendCode ? (
									<div className="text-lighter text-xs text-center text-error">
										Save your friend code to join the queue
									</div>
								) : (
									<PreviewQueueButton />
								)}
							</fetcher.Form>
						</>
					) : (
						<form
							className="stack md items-center"
							action={LOG_IN_URL}
							method="post"
						>
							<Button size="big" type="submit">
								{t("q:front.actions.logIn")}
							</Button>
						</form>
					)}
				</>
			) : null}
			<QLinks />
		</Main>
	);
}

const countries = [
	{
		id: 1,
		countryCode: "US",
		timeZone: "America/Los_Angeles",
		city: "la",
	},
	{ id: 2, countryCode: "US", timeZone: "America/New_York", city: "nyc" },
	{ id: 3, countryCode: "FR", timeZone: "Europe/Paris", city: "paris" },
	{ id: 4, countryCode: "JP", timeZone: "Asia/Tokyo", city: "tokyo" },
] as const;
const weekdayFormatter = ({
	timeZone,
	locale,
}: {
	timeZone: string;
	locale: string;
}) =>
	new Intl.DateTimeFormat([locale], {
		timeZone,
		weekday: "long",
	});
const clockFormatter = ({
	timeZone,
	locale,
}: {
	timeZone: string;
	locale: string;
}) =>
	new Intl.DateTimeFormat([locale], {
		timeZone,
		hour: "numeric",
		minute: "numeric",
	});
function Clocks() {
	const isMounted = useIsMounted();
	const { t, i18n } = useTranslation(["q"]);
	useAutoRerender();

	return (
		<div className="q__clocks-container">
			{countries.map((country) => {
				return (
					<div key={country.id} className="q__clock">
						<div className="q__clock-country">
							{t(`q:front.cities.${country.city}`)}
						</div>
						<Flag countryCode={country.countryCode} />
						<div className={clsx({ invisible: !isMounted })}>
							{isMounted
								? weekdayFormatter({
										timeZone: country.timeZone,
										locale: i18n.language,
									}).format(new Date())
								: // take space
									"Monday"}
						</div>
						<div className={clsx({ invisible: !isMounted })}>
							{isMounted
								? clockFormatter({
										timeZone: country.timeZone,
										locale: i18n.language,
									}).format(new Date())
								: // take space
									"0:00 PM"}
						</div>
					</div>
				);
			})}
		</div>
	);
}

function JoinTeamDialog({
	open,
	close,
	members,
}: {
	open: boolean;
	close: () => void;
	members: {
		username: string;
		role: Tables["GroupMember"]["role"];
	}[];
}) {
	const { t } = useTranslation(["q"]);
	const fetcher = useFetcher();

	const owner = members.find((m) => m.role === "OWNER");
	invariant(owner, "Owner not found");

	return (
		<Dialog
			isOpen={open}
			close={close}
			closeOnAnyClick={false}
			className="text-center"
		>
			{t("q:front.join.header", {
				members: joinListToNaturalString(members.map((m) => m.username)),
			})}
			<fetcher.Form
				className="stack horizontal justify-center sm mt-4 flex-wrap"
				method="post"
			>
				<SubmitButton _action="JOIN_TEAM" state={fetcher.state}>
					{t("q:front.join.joinAction")}
				</SubmitButton>
				<SubmitButton
					_action="JOIN_TEAM_WITH_TRUST"
					state={fetcher.state}
					variant="outlined"
				>
					{t("q:front.join.joinWithTrustAction", {
						inviterName: owner.username,
					})}
				</SubmitButton>
				<Button onClick={close} variant="destructive">
					{t("q:front.join.refuseAction")}
				</Button>
				<FormMessage type="info">
					{t("q:front.join.joinWithTrustAction.explanation")}
				</FormMessage>
			</fetcher.Form>
		</Dialog>
	);
}

function ActiveSeasonInfo({
	season,
}: {
	season: SerializeFrom<RankingSeason>;
}) {
	const { t, i18n } = useTranslation(["q"]);
	const isMounted = useIsMounted();

	const starts = new Date(season.starts);
	const ends = new Date(season.ends);

	const dateToString = (date: Date) =>
		date.toLocaleString(i18n.language, {
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "numeric",
		});

	return (
		<div
			className={clsx("text-lighter text-xs text-center", {
				invisible: !isMounted,
			})}
		>
			{t("q:front.seasonOpen", { nth: season.nth })}{" "}
			{isMounted ? (
				<b>
					{dateToString(starts)} - {dateToString(ends)}
				</b>
			) : null}
		</div>
	);
}

function QLinks() {
	const { t } = useTranslation(["q"]);
	const user = useUser();

	return (
		<div className="stack sm">
			<QLink
				navIcon="articles"
				url={SENDOUQ_INFO_PAGE}
				title={t("q:front.nav.info.title")}
				subText={t("q:front.nav.info.description")}
			/>
			{user ? (
				<QLink
					navIcon="settings"
					url={SENDOUQ_SETTINGS_PAGE}
					title={t("q:front.nav.settings.title")}
					subText={t("q:front.nav.settings.description")}
				/>
			) : null}
			<QLink
				navIcon="vods"
				url={SENDOUQ_STREAMS_PAGE}
				title={t("q:front.nav.streams.title")}
				subText={t("q:front.nav.streams.description")}
			/>
			<QLink
				navIcon="leaderboards"
				url={LEADERBOARDS_PAGE}
				title={t("q:front.nav.leaderboards.title")}
				subText={t("q:front.nav.leaderboards.description")}
			/>
			{user ? (
				<QLink
					navIcon="u"
					url={userSeasonsPage({ user })}
					title={t("q:front.nav.mySeason.title")}
					subText={t("q:front.nav.mySeason.description")}
				/>
			) : null}
			<QLink
				navIcon="articles"
				url={SENDOUQ_RULES_PAGE}
				title={t("q:front.nav.rules.title")}
				subText={t("q:front.nav.rules.description")}
			/>
		</div>
	);
}

function QLink({
	url,
	navIcon,
	title,
	subText,
}: {
	url: string;
	navIcon: string;
	title: string;
	subText: string;
}) {
	return (
		<Link to={url} className="q__front-page-link">
			<Image path={navIconUrl(navIcon)} alt="" width={32} />
			<div>
				{title}
				<div className="q__front-page-link__sub-text">{subText}</div>
			</div>
		</Link>
	);
}

function UpcomingSeasonInfo({
	season,
}: {
	season: SerializeFrom<RankingSeason>;
}) {
	const { t } = useTranslation(["q"]);
	const isMounted = useIsMounted();
	if (!isMounted) return null;

	const starts = new Date(season.starts);

	const dateToString = (date: Date) =>
		date.toLocaleString("en-US", {
			month: "long",
			day: "numeric",
			hour: "numeric",
		});

	return (
		<div className="font-semi-bold text-center text-sm">
			{t("q:front.upcomingSeason.header")}
			<br />
			{t("q:front.upcomingSeason.date", {
				nth: season.nth,
				date: dateToString(starts),
			})}
		</div>
	);
}

function NoUpcomingSeasonInfo() {
	const { t } = useTranslation(["q"]);

	return (
		<div className="font-semi-bold text-center text-sm">
			{t("q:front.upcomingSeason.header")}
			<br />
			{t("q:front.noUpcomingSeason")}
		</div>
	);
}

function PreviewQueueButton() {
	const user = useUser();
	const { t } = useTranslation(["q"]);

	if (!isAtLeastFiveDollarTierPatreon(user)) {
		return (
			<SendouPopover
				trigger={
					<SendouButton className="mx-auto text-xs" variant="minimal">
						{t("q:front.preview")}
					</SendouButton>
				}
			>
				{t("q:front.preview.explanation")}
			</SendouPopover>
		);
	}

	return (
		<LinkButton to={SENDOUQ_LOOKING_PREVIEW_PAGE} variant="minimal" size="tiny">
			{t("q:front.preview")}
		</LinkButton>
	);
}

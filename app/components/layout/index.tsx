import { faker } from "@faker-js/faker";
import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useMatches } from "react-router";
import type { RootLoaderData } from "~/root";
import type { Breadcrumb, SendouRouteHandle } from "~/utils/remix.server";
import { SendouButton } from "../elements/Button";
import { Image } from "../Image";
import { CalendarIcon } from "../icons/Calendar";
import { HamburgerIcon } from "../icons/Hamburger";
import { TwitchIcon } from "../icons/Twitch";
import { UsersIcon } from "../icons/Users";
import { SideNav, SideNavHeader, SideNavLink } from "../SideNav";
import { Footer } from "./Footer";
import styles from "./index.module.css";
import { NavDialog } from "./NavDialog";
import { TopRightButtons } from "./TopRightButtons";

function useTimeFormat() {
	const formatTime = (date: Date, options: Intl.DateTimeFormatOptions) => {
		return date.toLocaleTimeString("en-US", options);
	};
	return { formatTime };
}

const MOCK_STREAMS = [
	{
		id: 3,
		name: "Paddling Pool 252",
		imageUrl: faker.image.avatar(),
		subtitle: "Losers Finals",
		badge: "LIVE",
	},
	{
		id: 1,
		name: "Splash Go!",
		imageUrl:
			"https://liquipedia.net/commons/images/7/73/Splash_Go_allmode.png",
		subtitle: "Tomorrow, 9:00 AM",
	},
	{
		id: 2,
		name: "Area Cup",
		imageUrl:
			"https://pbs.twimg.com/profile_images/1830601967821017088/4SDZVKdj_400x400.jpg",
		subtitle: "Saturday, 10 AM",
	},
];

const MOCK_FRIENDS = [
	{
		id: 1,
		name: faker.internet.username(),
		avatarUrl: faker.image.avatar(),
		subtitle: "SendouQ",
		badge: "2/4",
	},
	{
		id: 2,
		name: faker.internet.username(),
		avatarUrl: faker.image.avatar(),
		subtitle: "Lobby",
		badge: "2/8",
	},
	{
		id: 3,
		name: faker.internet.username(),
		avatarUrl: faker.image.avatar(),
		subtitle: "In The Zone 22",
		badge: "3/4",
	},
	{
		id: 4,
		name: faker.internet.username(),
		avatarUrl: faker.image.avatar(),
		subtitle: "SendouQ",
		badge: "1/4",
	},
	{
		id: 5,
		name: faker.internet.username(),
		avatarUrl: faker.image.avatar(),
		subtitle: "Lobby",
		badge: "5/8",
	},
];

function useBreadcrumbs() {
	const { t } = useTranslation();
	const matches = useMatches();

	return React.useMemo(() => {
		const result: Array<Breadcrumb | Array<Breadcrumb>> = [];

		for (const match of [...matches].reverse()) {
			const handle = match.handle as SendouRouteHandle | undefined;
			const resolvedBreadcrumb = handle?.breadcrumb?.({ match, t });

			if (resolvedBreadcrumb) {
				result.push(resolvedBreadcrumb);
			}
		}

		return result.flat();
	}, [matches, t]);
}

export function Layout({
	children,
	data,
	isErrored = false,
}: {
	children: React.ReactNode;
	data?: RootLoaderData;
	isErrored?: boolean;
}) {
	const [navDialogOpen, setNavDialogOpen] = React.useState(false);
	const location = useLocation();
	const breadcrumbs = useBreadcrumbs();

	const { t } = useTranslation(["front"]);
	const { formatTime } = useTimeFormat();

	const isFrontPage = location.pathname === "/";

	const showLeaderboard =
		import.meta.env.VITE_PLAYWIRE_PUBLISHER_ID &&
		!data?.user?.roles.includes("MINOR_SUPPORT") &&
		!location.pathname.includes("plans");
	return (
		<>
			<NavDialog isOpen={navDialogOpen} close={() => setNavDialogOpen(false)} />
			{isFrontPage ? (
				<SendouButton
					icon={<HamburgerIcon />}
					className={clsx(styles.hamburger, styles.fab)}
					variant="outlined"
					onPress={() => setNavDialogOpen(true)}
				/>
			) : null}
			<SideNav>
				<SideNavHeader icon={<CalendarIcon />}>
					{t("front:sideNav.myCalendar")}
				</SideNavHeader>
				{data.tournaments.participatingFor.length > 0 ? (
					data.tournaments.participatingFor
						.slice(0, 4)
						.map((tournament, index) => (
							<SideNavLink
								key={tournament.id}
								href={tournament.url}
								imageUrl={tournament.logoUrl ?? undefined}
								subtitle={`${index < 2 ? "Today" : "Tomorrow"}, ${formatTime(
									new Date(tournament.startTime),
									{
										hour: "numeric",
										minute: "2-digit",
									},
								)}`}
							>
								{tournament.name}
							</SideNavLink>
						))
				) : (
					<div className={styles.sideNavEmpty}>
						{t("front:sideNav.noEvents")}
					</div>
				)}

				<SideNavHeader icon={<UsersIcon />}>
					{t("front:sideNav.friends")}
				</SideNavHeader>
				{MOCK_FRIENDS.map((friend) => (
					<SideNavLink
						key={friend.id}
						href=""
						imageUrl={friend.avatarUrl}
						subtitle={friend.subtitle}
						badge={friend.badge}
					>
						{friend.name}
					</SideNavLink>
				))}

				<SideNavHeader icon={<TwitchIcon />}>
					{t("front:sideNav.streams")}
				</SideNavHeader>
				{MOCK_STREAMS.map((stream) => (
					<SideNavLink
						key={stream.id}
						href=""
						imageUrl={stream.imageUrl}
						subtitle={stream.subtitle}
						badge={stream.badge}
					>
						{stream.name}
					</SideNavLink>
				))}
			</SideNav>
			<div className={styles.container}>
				<header className={clsx(styles.header, styles.itemSize)}>
					<div className={styles.breadcrumbContainer}>
						<Link to="/" className={clsx(styles.breadcrumb, styles.logo)}>
							sendou.ink
						</Link>
						{breadcrumbs.flatMap((breadcrumb) => {
							return [
								<span
									key={`${breadcrumb.href}-sep`}
									className={styles.breadcrumbSeparator}
								>
									»
								</span>,
								<BreadcrumbLink key={breadcrumb.href} data={breadcrumb} />,
							];
						})}
					</div>
					<TopRightButtons
						isErrored={isErrored}
						showSupport={Boolean(
							data &&
								!data?.user?.roles.includes("MINOR_SUPPORT") &&
								isFrontPage,
						)}
						openNavDialog={() => setNavDialogOpen(true)}
					/>
				</header>
				{showLeaderboard ? <MyRampUnit /> : null}
				{children}
				<Footer />
			</div>
		</>
	);
}

function BreadcrumbLink({ data }: { data: Breadcrumb }) {
	if (data.type === "IMAGE") {
		const imageIsWithExtension = data.imgPath.includes(".");

		return (
			<Link
				to={data.href}
				className={clsx(styles.breadcrumb, {
					"stack horizontal sm items-center": data.text,
				})}
			>
				{imageIsWithExtension ? (
					<img
						className={clsx(styles.breadcrumbImage, {
							"rounded-full": data.rounded,
						})}
						alt=""
						src={data.imgPath}
						width={24}
						height={24}
					/>
				) : (
					<Image
						className={clsx(styles.breadcrumbImage, {
							"rounded-full": data.rounded,
						})}
						alt=""
						path={data.imgPath}
						width={24}
						height={24}
					/>
				)}
				<span className={styles.textMobileHidden}>{data.text}</span>
			</Link>
		);
	}

	return (
		<Link to={data.href} className={styles.breadcrumb}>
			{data.text}
		</Link>
	);
}

function MyRampUnit() {
	return <div className="top-leaderboard" id="pw-leaderboard_atf" />;
}

import { Link, useLocation, useMatches } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { RootLoaderData } from "~/root";
import type { Breadcrumb, SendouRouteHandle } from "~/utils/remix.server";
import { Button } from "../Button";
import { Image } from "../Image";
import { HamburgerIcon } from "../icons/Hamburger";
import { Footer } from "./Footer";
import { NavDialog } from "./NavDialog";
import { TopRightButtons } from "./TopRightButtons";

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

export const Layout = React.memo(function Layout({
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

	const isFrontPage = location.pathname === "/";

	const showLeaderboard =
		import.meta.env.VITE_PLAYWIRE_PUBLISHER_ID &&
		!data?.user?.patronTier &&
		!location.pathname.includes("plans");
	return (
		<div className="layout__container">
			<NavDialog isOpen={navDialogOpen} close={() => setNavDialogOpen(false)} />
			{isFrontPage ? (
				<Button
					icon={<HamburgerIcon />}
					className="layout__hamburger-fab"
					variant="outlined"
					onClick={() => setNavDialogOpen(true)}
				/>
			) : null}
			<header className="layout__header layout__item_size">
				<div className="layout__breadcrumb-container">
					<Link to="/" className="layout__breadcrumb logo">
						sendou.ink
					</Link>
					{breadcrumbs.flatMap((breadcrumb) => {
						return [
							<span
								key={`${breadcrumb.href}-sep`}
								className="layout__breadcrumb-separator"
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
						data && typeof data?.user?.patronTier !== "number" && isFrontPage,
					)}
					openNavDialog={() => setNavDialogOpen(true)}
				/>
			</header>
			{showLeaderboard ? <MyRampUnit /> : null}
			{children}
			<Footer />
		</div>
	);
});

function BreadcrumbLink({ data }: { data: Breadcrumb }) {
	if (data.type === "IMAGE") {
		const imageIsWithExtension = data.imgPath.includes(".");

		return (
			<Link
				to={data.href}
				className={clsx("layout__breadcrumb", {
					"stack horizontal sm items-center": data.text,
				})}
			>
				{imageIsWithExtension ? (
					<img
						className={clsx("layout__breadcrumb__image", {
							"rounded-full": data.rounded,
						})}
						alt=""
						src={data.imgPath}
						width={24}
						height={24}
					/>
				) : (
					<Image
						className={clsx("layout__breadcrumb__image", {
							"rounded-full": data.rounded,
						})}
						alt=""
						path={data.imgPath}
						width={24}
						height={24}
					/>
				)}
				<span className="layout__breadcrumb__text-mobile-hidden">
					{data.text}
				</span>
			</Link>
		);
	}

	return (
		<Link to={data.href} className="layout__breadcrumb">
			{data.text}
		</Link>
	);
}
const MyRampUnit = React.memo(function MyRampUnit() {
	return <div className="top-leaderboard" id="pw-leaderboard_atf" />;
});

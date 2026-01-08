import clsx from "clsx";
import generalI18next from "i18next";
import NProgress from "nprogress";
import * as React from "react";
import { useEffect } from "react";
import { I18nProvider, RouterProvider } from "react-aria-components";
import { ErrorBoundary as ClientErrorBoundary } from "react-error-boundary";
import { useTranslation } from "react-i18next";
import type {
	LoaderFunctionArgs,
	MetaFunction,
	NavigateOptions,
} from "react-router";
import {
	data,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	type ShouldRevalidateFunction,
	useHref,
	useLoaderData,
	useMatches,
	useNavigate,
	useNavigation,
	useSearchParams,
} from "react-router";
import { useDebounce } from "react-use";
import { useChangeLanguage } from "remix-i18next/react";
import * as NotificationRepository from "~/features/notifications/NotificationRepository.server";
import { NOTIFICATIONS } from "~/features/notifications/notifications-contants";
import type { SendouRouteHandle } from "~/utils/remix.server";
import type { Route } from "./+types/root";
import { Catcher } from "./components/Catcher";
import { SendouToastRegion, toastQueue } from "./components/elements/Toast";
import { Layout } from "./components/layout";
import { Ramp } from "./components/ramp/Ramp";
import { getUser } from "./features/auth/core/user.server";
import { userMiddleware } from "./features/auth/core/user-middleware.server";
import {
	isTheme,
	Theme,
	ThemeHead,
	ThemeProvider,
	useTheme,
} from "./features/theme/core/provider";
import { getThemeSession } from "./features/theme/core/session.server";
import { useIsMounted } from "./hooks/useIsMounted";
import { DEFAULT_LANGUAGE } from "./modules/i18n/config";
import { i18nCookie, i18next } from "./modules/i18n/i18next.server";
import { IS_E2E_TEST_RUN } from "./utils/e2e";
import { allI18nNamespaces } from "./utils/i18n";
import { isRevalidation, metaTags, type SerializeFrom } from "./utils/remix";
import cachified from "@epic-web/cachified";
import type { Tables } from "~/db/tables";
import * as Changelog from "~/features/front-page/core/Changelog.server";
import { cachedFullUserLeaderboard } from "~/features/leaderboards/core/leaderboards.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { cache, IN_MILLISECONDS, ttl } from "~/utils/cache.server";
import { discordAvatarUrl, teamPage, userPage } from "~/utils/urls";
import * as ShowcaseTournaments from "../app/features/front-page/core/ShowcaseTournaments.server";

export const middleware: Route.MiddlewareFunction[] = [userMiddleware];

import "~/styles/vars.css";
import "~/styles/normalize.css";
import "~/styles/common.css";
import "~/styles/utils.css";
import "~/styles/flags.css";
import "nprogress/nprogress.css";

export const shouldRevalidate: ShouldRevalidateFunction = (args) => {
	if (isRevalidation(args)) return true;

	// user settings, lang change etc. require revalidation on root loader
	const isSettingsPage = args.currentUrl.pathname === "/settings";
	if (isSettingsPage) return true;

	return false;
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "sendou.ink",
		ogTitle: "sendou.ink - Competitive Splatoon Hub",
		location: args.location,
		description:
			"Sendou.ink is the home of competitive Splatoon featuring daily tournaments and a seasonal ladder. Variety of tools and the largest collection of builds by top players allow you to level up your skill in Splatoon 3.",
	});
};

export type RootLoaderData = SerializeFrom<typeof loader>;
export type LoggedInUser = NonNullable<RootLoaderData["user"]>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = getUser();
	const locale = await i18next.getLocale(request);
	const themeSession = await getThemeSession(request);

	const [tournaments, changelog, leaderboards] = await Promise.all([
		ShowcaseTournaments.frontPageTournamentsByUserId(user?.id ?? null),
		cachified({
			key: "front-changelog",
			cache,
			ttl: ttl(IN_MILLISECONDS.ONE_HOUR),
			staleWhileRevalidate: ttl(IN_MILLISECONDS.TWO_HOURS),
			async getFreshValue() {
				return Changelog.get();
			},
		}),
		cachedLeaderboards(),
	]);

	return data(
		{
			tournaments,
			changelog,
			leaderboards,
			locale,
			theme: themeSession.getTheme(),
			user: user
				? {
						username: user.username,
						discordAvatar: user.discordAvatar,
						discordId: user.discordId,
						id: user.id,
						customUrl: user.customUrl,
						inGameName: user.inGameName,
						friendCode: user.friendCode,
						preferences: user.preferences ?? {},
						languages: user.languages ? user.languages.split(",") : [],
						plusTier: user.plusTier,
						roles: user.roles,
					}
				: undefined,
			notifications: user
				? await NotificationRepository.findByUserId(user.id, {
						limit: NOTIFICATIONS.PEEK_COUNT,
					})
				: undefined,
		},
		{
			headers: { "Set-Cookie": await i18nCookie.serialize(locale) },
		},
	);
};

export interface LeaderboardEntry {
	name: string;
	url: string;
	avatarUrl: string | null;
	power: number;
}

const ENTRIES_PER_LEADERBOARD = 5;

function cachedLeaderboards(): Promise<{
	user: LeaderboardEntry[];
	team: LeaderboardEntry[];
}> {
	return cachified({
		key: "front-leaderboard",
		cache,
		ttl: ttl(IN_MILLISECONDS.ONE_HOUR),
		staleWhileRevalidate: ttl(IN_MILLISECONDS.TWO_HOURS),
		async getFreshValue() {
			const season = Seasons.currentOrPrevious()?.nth ?? 1;

			const [team, user] = await Promise.all([
				LeaderboardRepository.teamLeaderboardBySeason({
					season,
					onlyOneEntryPerUser: true,
				}),
				cachedFullUserLeaderboard(season),
			]);

			return {
				user: user.slice(0, ENTRIES_PER_LEADERBOARD).map((entry) => ({
					power: entry.power,
					name: entry.username,
					url: userPage(entry),
					avatarUrl: entry.discordAvatar
						? discordAvatarUrl({
								discordAvatar: entry.discordAvatar,
								discordId: entry.discordId,
								size: "sm",
							})
						: null,
				})),
				team: team
					.filter((entry) => entry.team)
					.slice(0, ENTRIES_PER_LEADERBOARD)
					.map((entry) => {
						const team = entry.team as Pick<
							Tables["Team"],
							"id" | "name" | "customUrl"
						> & { avatarUrl: string | null };

						return {
							power: entry.power,
							name: team.name,
							url: teamPage(team.customUrl),
							avatarUrl: team.avatarUrl,
						};
					}),
			};
		},
	});
}

export const handle: SendouRouteHandle = {
	i18n: ["common", "game-misc", "weapons"],
};

function Document({
	children,
	data,
	isErrored = false,
}: {
	children: React.ReactNode;
	data?: RootLoaderData;
	isErrored?: boolean;
}) {
	const { htmlThemeClass } = useTheme();
	const { i18n } = useTranslation();
	const navigate = useNavigate();
	const locale = data?.locale ?? DEFAULT_LANGUAGE;

	useChangeLanguage(locale);
	usePreloadTranslation();
	useLoadingIndicator();
	useTriggerToasts();
	const customizedCSSVars = useCustomizedCSSVars();

	return (
		<html
			lang={locale}
			dir={i18n.dir()}
			className={clsx(htmlThemeClass, "scrollbar")}
		>
			<head>
				<meta charSet="utf-8" />
				<meta
					name="viewport"
					content="initial-scale=1, viewport-fit=cover, user-scalable=no"
				/>
				<meta
					name="apple-mobile-web-app-status-bar-style"
					content="black-translucent"
				/>
				<meta name="apple-mobile-web-app-capable" content="yes" />
				<meta name="mobile-web-app-capable" content="yes" />
				<meta name="theme-color" content="#010115" />
				<Meta />
				<Links />
				<ThemeHead />
				<link rel="manifest" href="/app.webmanifest" />
				<PWALinks />
				<Fonts />
			</head>
			<body style={customizedCSSVars}>
				{IS_E2E_TEST_RUN && <HydrationTestIndicator />}
				<React.StrictMode>
					<RouterProvider navigate={navigate} useHref={useHref}>
						<I18nProvider locale={i18n.language}>
							<SendouToastRegion />
							<MyRamp data={data} />
							<Layout data={data} isErrored={isErrored}>
								{children}
							</Layout>
						</I18nProvider>
					</RouterProvider>
				</React.StrictMode>
				<ScrollRestoration
					getKey={(location) => {
						return location.pathname;
					}}
				/>
				<Scripts />
			</body>
		</html>
	);
}

function useTriggerToasts() {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();

	const error = searchParams.get("__error");
	const success = searchParams.get("__success");

	React.useEffect(() => {
		if (!error && !success) return;

		if (error) {
			toastQueue.add({
				message: error,
				variant: "error",
			});
		} else if (success) {
			toastQueue.add(
				{
					message: success,
					variant: "success",
				},
				{
					timeout: 5000,
				},
			);
		}

		navigate({ search: "" }, { replace: true });
	}, [error, success, navigate]);
}

function useLoadingIndicator() {
	const transition = useNavigation();

	useDebounce(
		() => {
			if (transition.state === "loading") {
				NProgress.start();
			} else if (transition.state === "idle") {
				NProgress.done();
			}
		},
		250,
		[transition.state],
	);
}

function usePreloadTranslation() {
	React.useEffect(() => {
		void generalI18next.loadNamespaces(allI18nNamespaces());
	}, []);
}

const CUSTOMIZED_CSS_VARS_NAME = "css";

function useCustomizedCSSVars() {
	const matches = useMatches();

	for (const match of matches) {
		if ((match.data as any)?.[CUSTOMIZED_CSS_VARS_NAME]) {
			return Object.fromEntries(
				Object.entries(
					(match.data as any)[CUSTOMIZED_CSS_VARS_NAME] as Record<
						string,
						string
					>,
				).map(([key, value]) => [
					`--${key}`,
					`var(--preview-${key}, ${value})`,
				]),
			) as React.CSSProperties;
		}
	}

	return;
}

declare module "react-aria-components" {
	interface RouterConfig {
		routerOptions: NavigateOptions;
	}
}

export default function App() {
	// prop drilling data instead of using useLoaderData in the child components directly because
	// useLoaderData can't be used in CatchBoundary and layout is rendered in it as well
	//
	// Update 14.10.23: not sure if this still applies as the CatchBoundary is gone
	const data = useLoaderData<RootLoaderData>();

	// Move overflow:hidden from html to body to allow position: sticky and position: fixed
	// elements to work properly when a React Aria Component disabled scrolling
	useEffect(() => {
		const htmlStyle = document.documentElement.style;
		const bodyStyle = document.body.style;

		const observer = new MutationObserver(() => {
			if (htmlStyle.overflow === "hidden") {
				htmlStyle.overflow = "";
				bodyStyle.overflow = "hidden";
				bodyStyle.scrollbarGutter = "stable";
			} else if (
				htmlStyle.overflow === "" &&
				htmlStyle.scrollbarGutter !== "stable"
			) {
				bodyStyle.overflow = "";
				bodyStyle.scrollbarGutter = "";
			}
		});

		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["style"],
		});

		return () => observer.disconnect();
	}, []);

	return (
		<ThemeProvider
			specifiedTheme={isTheme(data.theme) ? data.theme : null}
			themeSource="user-preference"
		>
			<Document data={data}>
				<Outlet />
			</Document>
		</ThemeProvider>
	);
}

export const ErrorBoundary = () => {
	return (
		<ThemeProvider themeSource="static" specifiedTheme={Theme.DARK}>
			<Document isErrored>
				<Catcher />
			</Document>
		</ThemeProvider>
	);
};

function HydrationTestIndicator() {
	const isMounted = useIsMounted();

	if (!isMounted) return null;

	return <div style={{ display: "none" }} data-testid="hydrated" />;
}

function Fonts() {
	return (
		<>
			<link rel="preconnect" href="https://fonts.googleapis.com" />
			<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
			<link
				href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&display=swap"
				rel="stylesheet"
			/>
		</>
	);
}

function PWALinks() {
	return (
		<>
			<link rel="apple-touch-icon" href="/static-assets/img/app-icon.png" />
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)"
				href="/static-assets/img/splash-screens/iPhone_14_Pro_Max_landscape.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)"
				href="/static-assets/img/splash-screens/iPhone_14_Pro_landscape.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)"
				href="/static-assets/img/splash-screens/iPhone_14_Plus__iPhone_13_Pro_Max__iPhone_12_Pro_Max_landscape.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)"
				href="/static-assets/img/splash-screens/iPhone_14__iPhone_13_Pro__iPhone_13__iPhone_12_Pro__iPhone_12_landscape.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)"
				href="/static-assets/img/splash-screens/iPhone_13_mini__iPhone_12_mini__iPhone_11_Pro__iPhone_XS__iPhone_X_landscape.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)"
				href="/static-assets/img/splash-screens/iPhone_11_Pro_Max__iPhone_XS_Max_landscape.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)"
				href="/static-assets/img/splash-screens/iPhone_11__iPhone_XR_landscape.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)"
				href="/static-assets/img/splash-screens/iPhone_8_Plus__iPhone_7_Plus__iPhone_6s_Plus__iPhone_6_Plus_landscape.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)"
				href="/static-assets/img/splash-screens/iPhone_8__iPhone_7__iPhone_6s__iPhone_6__4.7__iPhone_SE_landscape.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)"
				href="/static-assets/img/splash-screens/4__iPhone_SE__iPod_touch_5th_generation_and_later_landscape.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)"
				href="/static-assets/img/splash-screens/12.9__iPad_Pro_landscape.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)"
				href="/static-assets/img/splash-screens/11__iPad_Pro__10.5__iPad_Pro_landscape.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)"
				href="/static-assets/img/splash-screens/10.9__iPad_Air_landscape.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)"
				href="/static-assets/img/splash-screens/10.5__iPad_Air_landscape.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)"
				href="/static-assets/img/splash-screens/10.2__iPad_landscape.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)"
				href="/static-assets/img/splash-screens/9.7__iPad_Pro__7.9__iPad_mini__9.7__iPad_Air__9.7__iPad_landscape.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 744px) and (device-height: 1133px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)"
				href="/static-assets/img/splash-screens/8.3__iPad_Mini_landscape.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
				href="/static-assets/img/splash-screens/iPhone_14_Pro_Max_portrait.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
				href="/static-assets/img/splash-screens/iPhone_14_Pro_portrait.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
				href="/static-assets/img/splash-screens/iPhone_14_Plus__iPhone_13_Pro_Max__iPhone_12_Pro_Max_portrait.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
				href="/static-assets/img/splash-screens/iPhone_14__iPhone_13_Pro__iPhone_13__iPhone_12_Pro__iPhone_12_portrait.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
				href="/static-assets/img/splash-screens/iPhone_13_mini__iPhone_12_mini__iPhone_11_Pro__iPhone_XS__iPhone_X_portrait.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
				href="/static-assets/img/splash-screens/iPhone_11_Pro_Max__iPhone_XS_Max_portrait.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
				href="/static-assets/img/splash-screens/iPhone_11__iPhone_XR_portrait.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
				href="/static-assets/img/splash-screens/iPhone_8_Plus__iPhone_7_Plus__iPhone_6s_Plus__iPhone_6_Plus_portrait.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
				href="/static-assets/img/splash-screens/iPhone_8__iPhone_7__iPhone_6s__iPhone_6__4.7__iPhone_SE_portrait.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
				href="/static-assets/img/splash-screens/4__iPhone_SE__iPod_touch_5th_generation_and_later_portrait.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
				href="/static-assets/img/splash-screens/12.9__iPad_Pro_portrait.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
				href="/static-assets/img/splash-screens/11__iPad_Pro__10.5__iPad_Pro_portrait.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
				href="/static-assets/img/splash-screens/10.9__iPad_Air_portrait.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
				href="/static-assets/img/splash-screens/10.5__iPad_Air_portrait.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
				href="/static-assets/img/splash-screens/10.2__iPad_portrait.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
				href="/static-assets/img/splash-screens/9.7__iPad_Pro__7.9__iPad_mini__9.7__iPad_Air__9.7__iPad_portrait.png"
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 744px) and (device-height: 1133px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
				href="/static-assets/img/splash-screens/8.3__iPad_Mini_portrait.png"
			/>
		</>
	);
}

function MyRamp({ data }: { data: RootLoaderData | undefined }) {
	if (!data || data.user?.roles.includes("MINOR_SUPPORT")) {
		return null;
	}

	return (
		<ClientErrorBoundary fallback={null}>
			<Ramp />
		</ClientErrorBoundary>
	);
}

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
	useFetchers,
	useHref,
	useLoaderData,
	useLocation,
	useMatches,
	useNavigate,
	useNavigation,
	useRevalidator,
	useSearchParams,
} from "react-router";
import { Config } from "~/config";
import type { CustomTheme } from "~/db/tables-json";
import { resolveLayoutData } from "~/features/layout/core/layout.server";
import { useDebounce } from "~/hooks/useDebounce";
import lexendLatinUrl from "~/styles/fonts/lexend-latin.woff2?url";
import type { SendouRouteHandle } from "~/utils/remix.server";
import type { Route } from "./+types/root";
import { Catcher } from "./components/Catcher";
import { SendouToastRegion, toastQueue } from "./components/elements/Toast";
import { FusePageInit } from "./components/fuse/Fuse";
import { Layout, NPROGRESS_ANCHOR_ID } from "./components/layout";
import { getUser } from "./features/auth/core/user.server";
import { userMiddleware } from "./features/auth/core/user-middleware.server";
import { ChatProvider } from "./features/chat/ChatProvider";
import { isMatchResultsScopedRevalidation } from "./features/chat/revalidation-scope";
import { getSidenavSession } from "./features/layout/core/sidenav-session.server";
import { LayoutDataProvider } from "./features/layout/LayoutDataProvider";
import { NotificationsProvider } from "./features/notifications/NotificationsProvider";
import { sessionIdMiddleware } from "./features/session-id/session-id-middleware.server";
import {
	isTheme,
	Theme,
	ThemeHead,
	ThemeProvider,
	useTheme,
} from "./features/theme/core/provider";
import { getThemeSession } from "./features/theme/core/theme-session.server";
import { timezoneMiddleware } from "./features/timezone/timezone-middleware.server";
import { UnsavedChangesGuard } from "./form/UnsavedChangesGuard";
import { useUserIntlPreference } from "./hooks/intl/useUserIntlPreference";
import { useHydrated } from "./hooks/useHydrated";
import {
	ALWAYS_LOADED_NAMESPACES,
	DEFAULT_LANGUAGE,
} from "./modules/i18n/config";
import {
	getLocale,
	i18nCookie,
	i18nMiddleware,
} from "./modules/i18n/i18next.server";
import { localePreloadUrls } from "./modules/i18n/locale-preload.server";
import { useChangeLanguage } from "./modules/i18n/useChangeLanguage";
import { isSupporter } from "./modules/permissions/utils";
import { redirectsMiddleware } from "./modules/redirects/redirects-middleware.server";
import { SearchParamsProvider } from "./modules/search-params/hooks";
import { IS_E2E_TEST_RUN } from "./utils/e2e";
import { allI18nNamespaces } from "./utils/i18n";
import { isRevalidation, metaTags, type SerializeFrom } from "./utils/remix";
import { requestContextMiddleware } from "./utils/request-context-middleware.server";
import { APP_ICON_URL, pwaSplashScreenImageUrl } from "./utils/urls";

const PRELOAD_TRANSLATION_TIMEOUT_MS = 3000;

export const middleware: Route.MiddlewareFunction[] = [
	redirectsMiddleware,
	requestContextMiddleware,
	sessionIdMiddleware,
	userMiddleware,
	i18nMiddleware,
	timezoneMiddleware,
];

import "~/styles/fonts.css";
import "~/styles/vars.css";
import "~/styles/normalize.css";
import "~/styles/common.css";
import "~/styles/utils.css";
import "~/styles/flags.css";
import "nprogress/nprogress.css";

// anchors the loading bar to the header (between the sidebars); at module scope so
// even the very first navigation's NProgress.start doesn't render over the sidebar
NProgress.configure({ parent: `#${NPROGRESS_ANCHOR_ID}` });

type DevFaviconColors = { fill: string; stroke: string };

// tints the favicon per local dev instance so the browser tabs of parallel
// worktrees are told apart, matching each one's VS Code (Peacock) colors
const DEV_FAVICON_COLORS: Record<string, DevFaviconColors | undefined> = {
	yellow: { fill: "#eae4c8", stroke: "#dcd2a3" },
	pink: { fill: "#eac8dd", stroke: "#dca3c6" },
	cyan: { fill: "#c8e3ea", stroke: "#a3d0dc" },
};

export const shouldRevalidate: ShouldRevalidateFunction = (args) => {
	if (isMatchResultsScopedRevalidation(args)) return false;
	if (isRevalidation(args)) return true;

	if (args.formData?.get("revalidateRoot") === "true") return true;

	const json = args.json as Record<string, unknown> | undefined;
	if (json?.revalidateRoot === true) return true;

	// biome-ignore lint/plugin: presence check only, before any route's definition has parsed the URL
	if (args.nextUrl.searchParams.has("lng")) return true;

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
	const locale = getLocale();
	const themeSession = await getThemeSession(request);
	const sidenavSession = await getSidenavSession(request);

	const layoutData = await resolveLayoutData(user);

	return data(
		{
			locale,
			i18nPreloadUrls: localePreloadUrls(locale),
			theme: themeSession.getTheme(),
			sidenavCollapsed: sidenavSession.getCollapsed(),
			user: user
				? {
						username: user.username,
						discordAvatar: user.discordAvatar,
						discordId: user.discordId,
						id: user.id,
						customUrl: user.customUrl,
						customAvatarUrl: user.customAvatarUrl,
						inGameName: user.inGameName,
						friendCode: user.friendCode,
						preferences: user.preferences ?? {},
						languages: user.languages ?? [],
						plusTier: user.plusTier,
						roles: user.roles,
						createdAt: user.createdAt,
					}
				: undefined,
			customTheme: isSupporter(user) ? user?.customTheme : undefined,
			devFaviconColors: devFaviconColors(request),
			...layoutData,
		},
		{
			headers: { "Set-Cookie": await i18nCookie.serialize(locale) },
		},
	);
};

export const handle: SendouRouteHandle = {
	i18n: [...ALWAYS_LOADED_NAMESPACES],
};

function Document({
	children,
	data,
}: {
	children: React.ReactNode;
	data?: RootLoaderData;
}) {
	const { htmlThemeClass } = useTheme();
	const { i18n } = useTranslation();
	const { language } = useUserIntlPreference();
	const navigate = useNavigate();
	const locale = data?.locale ?? DEFAULT_LANGUAGE;
	const customThemeStyle = useCustomThemeVars();

	useChangeLanguage(locale);
	usePreloadTranslation();
	useLoadingIndicator();
	useTriggerToasts();

	const htmlStyle: Record<string, string | number> = {
		...Object.fromEntries(customThemeStyle),
		...(data?.user?.roles.includes("MINOR_SUPPORT")
			? { "--layout-fuse-bottom-height": "0px" }
			: {}),
	};

	return (
		<html
			lang={locale}
			dir={i18n.dir()}
			className={clsx(htmlThemeClass, "scrollbar")}
			style={htmlStyle}
			data-fuse={
				Config.fuseEnabled && !data?.user?.roles.includes("MINOR_SUPPORT")
					? "true"
					: undefined
			}
			suppressHydrationWarning
		>
			<head>
				<meta charSet="utf-8" />
				{Config.fuseEnabled &&
				// check for data so supporters don't see ads on error page
				data &&
				!data.user?.roles.includes("MINOR_SUPPORT") ? (
					<script
						async
						src="https://cdn.fuseplatform.net/publift/tags/2/4242/fuse.js"
					/>
				) : null}
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
				{data?.i18nPreloadUrls?.map((url) => (
					<link
						key={url}
						rel="preload"
						as="fetch"
						crossOrigin="anonymous"
						href={url}
					/>
				))}
				<ThemeHead />
				{data?.devFaviconColors ? (
					<DevFavicon colors={data.devFaviconColors} />
				) : null}
				<link rel="manifest" href="/app.webmanifest" />
				<PWALinks />
				<Fonts />
			</head>
			<body>
				{IS_E2E_TEST_RUN && <HydrationTestIndicator />}
				<React.StrictMode>
					<SearchParamsProvider>
						<RouterProvider navigate={navigate} useHref={useExternalAwareHref}>
							<I18nProvider locale={language}>
								<SendouToastRegion />
								<UnsavedChangesGuard />
								<MyFuse data={data} />
								<ChatProvider user={data?.user}>
									<NotificationsProvider user={data?.user}>
										<LayoutDataProvider data={data}>
											<Layout data={data}>{children}</Layout>
										</LayoutDataProvider>
									</NotificationsProvider>
								</ChatProvider>
							</I18nProvider>
						</RouterProvider>
					</SearchParamsProvider>
				</React.StrictMode>
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

const ABSOLUTE_URL_REGEX = /^[a-z][a-z\d+\-.]*:/i;

/** Href for React Aria links: `useHref` would resolve an absolute URL like a Twitch link into a path of our own. */
function useExternalAwareHref(href: string) {
	const resolved = useHref(href);

	return ABSOLUTE_URL_REGEX.test(href) ? href : resolved;
}

function useTriggerToasts() {
	// biome-ignore lint/plugin: app-wide toast params written by server redirects, belonging to no one feature
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

		navigate({ search: "" }, { replace: true, defaultShouldRevalidate: false });
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
		150,
		[transition.state],
	);
}

function usePreloadTranslation() {
	React.useEffect(() => {
		const loadAll = () =>
			void generalI18next.loadNamespaces(allI18nNamespaces());

		if (typeof window.requestIdleCallback !== "function") {
			const timeoutId = window.setTimeout(
				loadAll,
				PRELOAD_TRANSLATION_TIMEOUT_MS,
			);
			return () => window.clearTimeout(timeoutId);
		}

		const idleId = window.requestIdleCallback(loadAll, {
			timeout: PRELOAD_TRANSLATION_TIMEOUT_MS,
		});
		return () => window.cancelIdleCallback(idleId);
	}, []);
}

declare module "react-aria-components" {
	interface RouterConfig {
		routerOptions: NavigateOptions;
	}
}

function useCustomThemeVars() {
	const matches = useMatches();
	const styles: Map<string, number> = new Map();

	for (const match of matches) {
		const data = match.loaderData as { customTheme?: CustomTheme } | undefined;

		if (data?.customTheme) {
			for (const [key, value] of Object.entries(data.customTheme)) {
				// Skips size and border variables for themes that arent the user's own
				if (
					match.id !== "root" &&
					(key.includes("--_size") || key.includes("--_border"))
				)
					continue;
				if (value === null) continue;

				styles.set(key, value);
			}
		}
	}

	return styles;
}

export default function App() {
	const data = useLoaderData<RootLoaderData>();

	// Move overflow:hidden from html to body to allow position: sticky and position: fixed
	// elements to work properly when a React Aria Component disabled scrolling
	useEffect(() => {
		const htmlStyle = document.documentElement.style;
		const bodyStyle = document.body.style;

		const observer = new MutationObserver(() => {
			observer.disconnect();

			if (htmlStyle.overflow === "hidden") {
				htmlStyle.overflow = "";
				htmlStyle.scrollbarGutter = "";

				const scrollbarWidth =
					window.innerWidth - document.documentElement.clientWidth;

				htmlStyle.overflow = "initial";
				bodyStyle.overflow = "hidden";
				bodyStyle.paddingRight = `${scrollbarWidth}px`;
			} else if (bodyStyle.overflow === "hidden") {
				bodyStyle.overflow = "";
				bodyStyle.paddingRight = "";
			}

			observer.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ["style"],
			});
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
			<Document>
				<Catcher />
			</Document>
		</ThemeProvider>
	);
};

function HydrationTestIndicator() {
	const isHydrated = useHydrated();
	const navigation = useNavigation();
	const revalidator = useRevalidator();
	const fetchers = useFetchers();
	const location = useLocation();

	if (!isHydrated) return null;

	const busy = [
		navigation.state !== "idle"
			? `nav:${navigation.state}:${navigation.location?.pathname}`
			: null,
		revalidator.state !== "idle" ? `revalidator:${revalidator.state}` : null,
		...fetchers
			.filter((fetcher) => fetcher.state !== "idle")
			.map(
				(fetcher) =>
					`fetcher[${fetcher.key}]:${fetcher.state}:${fetcher.formAction ?? "load"}`,
			),
	].filter(Boolean);

	const routerIdle = busy.length === 0;

	return (
		<div
			style={{ display: "none" }}
			data-testid="hydrated"
			data-router-idle={routerIdle ? "true" : undefined}
			data-router-busy={routerIdle ? undefined : busy.join(" | ")}
			// the rendered search trails the browser's by a commit: once the toast params are
			// gone from here the forms keyed on the location (see SendouForm) have remounted
			data-location-search={location.search}
		/>
	);
}

function devFaviconColors(request: Request) {
	if (process.env.NODE_ENV !== "development") return;

	const [subdomain] = new URL(request.url).hostname.split(".");

	return DEV_FAVICON_COLORS[subdomain];
}

function DevFavicon({ colors }: { colors: DevFaviconColors }) {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="8" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="4" /></svg>`;

	return (
		<link
			rel="icon"
			type="image/svg+xml"
			href={`data:image/svg+xml,${encodeURIComponent(svg)}`}
		/>
	);
}

function Fonts() {
	return (
		<link
			rel="preload"
			href={lexendLatinUrl}
			as="font"
			type="font/woff2"
			crossOrigin="anonymous"
		/>
	);
}

function PWALinks() {
	return (
		<>
			<link rel="apple-touch-icon" href={APP_ICON_URL} />
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)"
				href={pwaSplashScreenImageUrl("iPhone_14_Pro_Max_landscape.png")}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)"
				href={pwaSplashScreenImageUrl("iPhone_14_Pro_landscape.png")}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)"
				href={pwaSplashScreenImageUrl(
					"iPhone_14_Plus__iPhone_13_Pro_Max__iPhone_12_Pro_Max_landscape.png",
				)}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)"
				href={pwaSplashScreenImageUrl(
					"iPhone_14__iPhone_13_Pro__iPhone_13__iPhone_12_Pro__iPhone_12_landscape.png",
				)}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)"
				href={pwaSplashScreenImageUrl(
					"iPhone_13_mini__iPhone_12_mini__iPhone_11_Pro__iPhone_XS__iPhone_X_landscape.png",
				)}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)"
				href={pwaSplashScreenImageUrl(
					"iPhone_11_Pro_Max__iPhone_XS_Max_landscape.png",
				)}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)"
				href={pwaSplashScreenImageUrl("iPhone_11__iPhone_XR_landscape.png")}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)"
				href={pwaSplashScreenImageUrl(
					"iPhone_8_Plus__iPhone_7_Plus__iPhone_6s_Plus__iPhone_6_Plus_landscape.png",
				)}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)"
				href={pwaSplashScreenImageUrl(
					"iPhone_8__iPhone_7__iPhone_6s__iPhone_6__4.7__iPhone_SE_landscape.png",
				)}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)"
				href={pwaSplashScreenImageUrl(
					"4__iPhone_SE__iPod_touch_5th_generation_and_later_landscape.png",
				)}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)"
				href={pwaSplashScreenImageUrl("12.9__iPad_Pro_landscape.png")}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)"
				href={pwaSplashScreenImageUrl(
					"11__iPad_Pro__10.5__iPad_Pro_landscape.png",
				)}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)"
				href={pwaSplashScreenImageUrl("10.9__iPad_Air_landscape.png")}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)"
				href={pwaSplashScreenImageUrl("10.5__iPad_Air_landscape.png")}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)"
				href={pwaSplashScreenImageUrl("10.2__iPad_landscape.png")}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)"
				href={pwaSplashScreenImageUrl(
					"9.7__iPad_Pro__7.9__iPad_mini__9.7__iPad_Air__9.7__iPad_landscape.png",
				)}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 744px) and (device-height: 1133px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)"
				href={pwaSplashScreenImageUrl("8.3__iPad_Mini_landscape.png")}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
				href={pwaSplashScreenImageUrl("iPhone_14_Pro_Max_portrait.png")}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
				href={pwaSplashScreenImageUrl("iPhone_14_Pro_portrait.png")}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
				href={pwaSplashScreenImageUrl(
					"iPhone_14_Plus__iPhone_13_Pro_Max__iPhone_12_Pro_Max_portrait.png",
				)}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
				href={pwaSplashScreenImageUrl(
					"iPhone_14__iPhone_13_Pro__iPhone_13__iPhone_12_Pro__iPhone_12_portrait.png",
				)}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
				href={pwaSplashScreenImageUrl(
					"iPhone_13_mini__iPhone_12_mini__iPhone_11_Pro__iPhone_XS__iPhone_X_portrait.png",
				)}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
				href={pwaSplashScreenImageUrl(
					"iPhone_11_Pro_Max__iPhone_XS_Max_portrait.png",
				)}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
				href={pwaSplashScreenImageUrl("iPhone_11__iPhone_XR_portrait.png")}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
				href={pwaSplashScreenImageUrl(
					"iPhone_8_Plus__iPhone_7_Plus__iPhone_6s_Plus__iPhone_6_Plus_portrait.png",
				)}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
				href={pwaSplashScreenImageUrl(
					"iPhone_8__iPhone_7__iPhone_6s__iPhone_6__4.7__iPhone_SE_portrait.png",
				)}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
				href={pwaSplashScreenImageUrl(
					"4__iPhone_SE__iPod_touch_5th_generation_and_later_portrait.png",
				)}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
				href={pwaSplashScreenImageUrl("12.9__iPad_Pro_portrait.png")}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
				href={pwaSplashScreenImageUrl(
					"11__iPad_Pro__10.5__iPad_Pro_portrait.png",
				)}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
				href={pwaSplashScreenImageUrl("10.9__iPad_Air_portrait.png")}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
				href={pwaSplashScreenImageUrl("10.5__iPad_Air_portrait.png")}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
				href={pwaSplashScreenImageUrl("10.2__iPad_portrait.png")}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
				href={pwaSplashScreenImageUrl(
					"9.7__iPad_Pro__7.9__iPad_mini__9.7__iPad_Air__9.7__iPad_portrait.png",
				)}
			/>
			<link
				rel="apple-touch-startup-image"
				media="screen and (device-width: 744px) and (device-height: 1133px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
				href={pwaSplashScreenImageUrl("8.3__iPad_Mini_portrait.png")}
			/>
		</>
	);
}

function MyFuse({ data }: { data: RootLoaderData | undefined }) {
	if (!data || data.user?.roles.includes("MINOR_SUPPORT")) {
		return null;
	}

	return (
		<ClientErrorBoundary fallback={null}>
			<FusePageInit />
		</ClientErrorBoundary>
	);
}

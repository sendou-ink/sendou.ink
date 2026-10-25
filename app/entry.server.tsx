import { isbot } from "isbot";
import cron from "node-cron";
import { renderToReadableStream } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import {
	type EntryContext,
	type HandleDataRequestFunction,
	type HandleErrorFunction,
	isRouteErrorResponse,
	type RouterContextProvider,
	ServerRouter,
} from "react-router";
import { ServerConfig } from "~/config.server";
import { devToolsServerHooks } from "~/features/dev-tools/dev-tools-server-hooks.server";
import { getI18nInstance } from "~/modules/i18n/i18next.server";
import {
	daily,
	everyHourAt00,
	everyHourAt30,
	everyTwoMinutes,
	weekly,
} from "./routines/list.server";
import { loadAllDateFnsLocales } from "./utils/dates";
import { IS_E2E_TEST_RUN } from "./utils/e2e";
import { logger } from "./utils/logger";

export const streamTimeout = 5000;

const PREFETCH_CACHE_CONTROL = "private, max-age=10";
const DEFAULT_CACHE_CONTROL = "private, no-cache";

const dateFnsLocalesLoaded = loadAllDateFnsLocales();

async function handleRequest(
	request: Request,
	responseStatusCode: number,
	responseHeaders: Headers,
	reactRouterContext: EntryContext,
	loadContext: RouterContextProvider,
) {
	await dateFnsLocalesLoaded;

	if (!responseHeaders.has("Cache-Control")) {
		responseHeaders.set("Cache-Control", DEFAULT_CACHE_CONTROL);
	}

	const instance = getI18nInstance(loadContext);

	let didError = false;
	const body = await renderToReadableStream(
		<I18nextProvider i18n={instance}>
			<ServerRouter context={reactRouterContext} url={request.url} />
		</I18nextProvider>,
		{
			// +1s gives React time to flush the rejected boundary contents
			signal: AbortSignal.timeout(streamTimeout + 1000),
			onError(error: unknown) {
				didError = true;

				logger.error(error);
			},
		},
	);

	if (isbot(request.headers.get("user-agent"))) {
		await body.allReady;
	}

	responseHeaders.set("Content-Type", "text/html; charset=utf-8");

	return new Response(body, {
		headers: responseHeaders,
		status: didError ? 500 : responseStatusCode,
	});
}

/** Lets the browser reuse a hover-prefetched loader response on the click that follows it. Varies by cookie so that a mutation (see `invalidatePrefetchedLoaderData` in entry.client.tsx) or a log in invalidates it. Every other response defaults to private so a CDN never caches user data. */
export const handleDataRequest: HandleDataRequestFunction = (
	response,
	{ request },
) => {
	const isReusablePrefetch =
		request.method === "GET" &&
		response.ok &&
		request.headers.get("Sec-Purpose") === "prefetch";
	if (!isReusablePrefetch && response.headers.has("Cache-Control")) {
		return response;
	}

	const headers = new Headers(response.headers);
	if (isReusablePrefetch) {
		headers.set("Cache-Control", PREFETCH_CACHE_CONTROL);
		headers.set("Vary", "Cookie");
	} else {
		headers.set("Cache-Control", DEFAULT_CACHE_CONTROL);
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
};

declare global {
	var appStartSignal: undefined | true;
}

if (!global.appStartSignal && ServerConfig.isProduction && !IS_E2E_TEST_RUN) {
	global.appStartSignal = true;

	cron.schedule("0 */1 * * *", async () => {
		for (const routine of everyHourAt00) {
			await routine.run();
		}
	});

	cron.schedule("30 */1 * * *", async () => {
		for (const routine of everyHourAt30) {
			await routine.run();
		}
	});

	// 4:00 AM UTC
	cron.schedule("0 4 * * *", async () => {
		for (const routine of daily) {
			await routine.run();
		}
	});

	// 9:00 AM Finnish time on Wednesdays, a quiet hour since vacuuming blocks writes longer than the 5s busy_timeout
	cron.schedule(
		"0 9 * * 3",
		async () => {
			for (const routine of weekly) {
				await routine.run();
			}
		},
		{ timezone: "Europe/Helsinki" },
	);

	cron.schedule("*/2 * * * *", async () => {
		for (const routine of everyTwoMinutes) {
			await routine.run();
		}
	});
}

process.on("unhandledRejection", (reason: string, p: Promise<any>) => {
	logger.error("Unhandled Rejection at:", p, "reason:", reason);
});

process.on("uncaughtException", (error) => {
	logger.error("Uncaught Exception:", error);
	process.exit(1);
});

// routes through logger so the request id shows in server logs
export const handleError: HandleErrorFunction = (error, { request }) => {
	if (request.signal.aborted) return;
	if (isRouteErrorResponse(error) && error.status < 500) return;

	if (devToolsServerHooks) {
		devToolsServerHooks.logRequestError(request, () => logger.error(error));
		return;
	}

	logger.error(error);
};
export default handleRequest;

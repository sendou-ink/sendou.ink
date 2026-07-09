import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import * as Sentry from "@sentry/react-router";
import { isbot } from "isbot";
import cron from "node-cron";
import { renderToPipeableStream } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import {
	type EntryContext,
	type HandleErrorFunction,
	type RouterContextProvider,
	ServerRouter,
} from "react-router";
import { Config } from "~/config";
import { ServerConfig } from "~/config.server";
import { getI18nInstance } from "~/modules/i18n/i18next.server";
import {
	daily,
	everyHourAt00,
	everyHourAt30,
	everyTwoMinutes,
} from "./routines/list.server";
import { logger } from "./utils/logger";

// Reject/cancel all pending promises after 5 seconds
export const streamTimeout = 5000;

const SENTRY_ENABLED = Config.sentry.enabled;

async function handleRequest(
	request: Request,
	responseStatusCode: number,
	responseHeaders: Headers,
	reactRouterContext: EntryContext,
	loadContext: RouterContextProvider,
) {
	const callbackName = isbot(request.headers.get("user-agent"))
		? "onAllReady"
		: "onShellReady";

	const instance = getI18nInstance(loadContext);

	return new Promise((resolve, reject) => {
		let didError = false;

		const { pipe, abort } = renderToPipeableStream(
			<I18nextProvider i18n={instance}>
				<ServerRouter context={reactRouterContext} url={request.url} />
			</I18nextProvider>,
			{
				[callbackName]: () => {
					const body = new PassThrough();
					const stream = createReadableStreamFromReadable(body);
					responseHeaders.set("Content-Type", "text/html");

					resolve(
						new Response(stream, {
							headers: responseHeaders,
							status: didError ? 500 : responseStatusCode,
						}),
					);

					pipe(SENTRY_ENABLED ? Sentry.getMetaTagTransformer(body) : body);
				},
				onShellError(error: unknown) {
					reject(error);
				},
				onError(error: unknown) {
					didError = true;

					logger.error(error);
				},
			},
		);

		// Automatically timeout the React renderer after 6 seconds, which ensures
		// React has enough time to flush down the rejected boundary contents
		setTimeout(abort, streamTimeout + 1000);
	});
}

// example from https://github.com/BenMcH/remix-rss/blob/main/app/entry.server.tsx
declare global {
	var appStartSignal: undefined | true;
}

if (!global.appStartSignal && ServerConfig.isProduction) {
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

	cron.schedule("*/2 * * * *", async () => {
		for (const routine of everyTwoMinutes) {
			await routine.run();
		}
	});
}

process.on("unhandledRejection", (reason: string, p: Promise<any>) => {
	logger.error("Unhandled Rejection at:", p, "reason:", reason);
});

// wrapper so we get request id shown in the server logs
export const handleError: HandleErrorFunction = (error, { request }) => {
	if (SENTRY_ENABLED && !request.signal.aborted) {
		Sentry.captureException(error);
	}
	logger.error(error);
};
export default SENTRY_ENABLED
	? Sentry.wrapSentryHandleRequest(handleRequest)
	: handleRequest;
export const instrumentations = SENTRY_ENABLED
	? [Sentry.createSentryServerInstrumentation()]
	: [];

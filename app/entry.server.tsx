import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { createInstance } from "i18next";
import { isbot } from "isbot";
import cron from "node-cron";
import { renderToPipeableStream } from "react-dom/server";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { type EntryContext, ServerRouter } from "react-router";
import { config } from "~/modules/i18n/config"; // your i18n configuration file
import { i18next } from "~/modules/i18n/i18next.server";
import { resources } from "./modules/i18n/resources.server";
import { daily, everyHourAt00, everyHourAt30 } from "./routines/list.server";
import { logger } from "./utils/logger";

// Reject/cancel all pending promises after 5 seconds
export const streamTimeout = 5000;

export default async function handleRequest(
	request: Request,
	responseStatusCode: number,
	responseHeaders: Headers,
	reactRouterContext: EntryContext,
) {
	const callbackName = isbot(request.headers.get("user-agent"))
		? "onAllReady"
		: "onShellReady";

	const instance = createInstance();
	const lng = await i18next.getLocale(request);
	const ns = i18next.getRouteNamespaces(reactRouterContext);

	await instance
		.use(initReactI18next) // Tell our instance to use react-i18next
		.init({
			...config, // spread the configuration
			lng, // The locale we detected above
			ns, // The namespaces the routes about to render wants to use
			resources,
		});

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

					pipe(body);
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

if (!global.appStartSignal && process.env.NODE_ENV === "production") {
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
}

process.on("unhandledRejection", (reason: string, p: Promise<any>) => {
	logger.error("Unhandled Rejection at:", p, "reason:", reason);
});

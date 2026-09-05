import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
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
import { ServerConfig } from "~/config.server";
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

const dateFnsLocalesLoaded = loadAllDateFnsLocales();

async function handleRequest(
	request: Request,
	responseStatusCode: number,
	responseHeaders: Headers,
	reactRouterContext: EntryContext,
	loadContext: RouterContextProvider,
) {
	await dateFnsLocalesLoaded;

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

		// +1s gives React time to flush the rejected boundary contents
		setTimeout(abort, streamTimeout + 1000);
	});
}

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

// routes through logger so the request id shows in server logs
export const handleError: HandleErrorFunction = (error) => {
	logger.error(error);
};
export default handleRequest;

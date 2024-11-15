import { PassThrough } from "node:stream";
import {
	type EntryContext,
	createReadableStreamFromReadable,
} from "@remix-run/node";
import { RemixServer } from "@remix-run/react";
import { createInstance } from "i18next";
import { isbot } from "isbot";
import cron from "node-cron";
import { renderToPipeableStream } from "react-dom/server";
import { I18nextProvider, initReactI18next } from "react-i18next";
import * as QRepository from "~/features/sendouq/QRepository.server";
import { config } from "~/modules/i18n/config"; // your i18n configuration file
import i18next from "~/modules/i18n/i18next.server";
import { resources } from "./modules/i18n/resources.server";
import { updatePatreonData } from "./modules/patreon";
import { logger } from "./utils/logger";

const ABORT_DELAY = 5000;

export default async function handleRequest(
	request: Request,
	responseStatusCode: number,
	responseHeaders: Headers,
	remixContext: EntryContext,
) {
	const callbackName = isbot(request.headers.get("user-agent"))
		? "onAllReady"
		: "onShellReady";

	const instance = createInstance();
	const lng = await i18next.getLocale(request);
	const ns = i18next.getRouteNamespaces(remixContext);

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
				<RemixServer context={remixContext} url={request.url} />
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

					console.error(error);
				},
			},
		);

		setTimeout(abort, ABORT_DELAY);
	});
}

// example from https://github.com/BenMcH/remix-rss/blob/main/app/entry.server.tsx
declare global {
	var appStartSignal: undefined | true;
}

if (!global.appStartSignal && process.env.NODE_ENV === "production") {
	global.appStartSignal = true;

	// every 2 hours
	cron.schedule("0 */2 * * *", () =>
		updatePatreonData().catch((err) => console.error(err)),
	);

	// every hour
	cron.schedule("0 */1 * * *", async () => {
		const { numDeletedRows } = await QRepository.deleteOldTrust();
		logger.info(`Deleted ${numDeletedRows} old trusts`);

		const { numUpdatedRows } = await QRepository.setOldGroupsAsInactive();
		logger.info(`Set ${numUpdatedRows} as inactive`);
	});
}

process.on("unhandledRejection", (reason: string, p: Promise<any>) => {
	console.error("Unhandled Rejection at:", p, "reason:", reason);
});

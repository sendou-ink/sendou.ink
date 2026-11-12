// Measurement only (scripts/measure.ts): the React counterpart of the slice's /bench/render endpoint.
// Server-renders the associations route component repeatedly with a user's data and prints the time
// per render, leaving out the request handling, the loaders and the app shell around it.
// Prints "ready" once set up, then renders one round per line read from stdin and prints its result
// as a JSON line, so that measure.ts can alternate its rounds with the slice's. Run from the repo root:
//   NODE_ENV=production vite-node -c svelte/scripts/react-render-bench.vite.config.ts --mode production \
//     svelte/scripts/react-render-bench.tsx <userId> [iterations]
import fs from "node:fs";
import readline from "node:readline";
import i18next from "i18next";
import { renderToString } from "react-dom/server";
import { I18nextProvider, initReactI18next } from "react-i18next";
import {
	createStaticHandler,
	createStaticRouter,
	StaticRouterProvider,
} from "react-router";
import * as AssociationRepository from "~/features/associations/AssociationRepository.server";
import AssociationsPage from "~/features/associations/routes/associations";
import { UserProvider } from "~/features/auth/core/user";

const DEFAULT_ITERATIONS = 1000;
const NAMESPACES = ["common", "scrims", "forms"];

const userId = Number(process.argv[2]);
const iterations = Number(process.argv[3]) || DEFAULT_ITERATIONS;

if (process.env.NODE_ENV !== "production") {
	throw new Error("Run with NODE_ENV=production, React's dev build is slower");
}

const associations = (
	await AssociationRepository.findByMemberUserId(userId, { withMembers: true })
).actual;
const loaderData = {
	associations: [] as Array<
		(typeof associations)[number] & { inviteCode: string | undefined }
	>,
	toJoin: null,
};
for (const association of associations) {
	loaderData.associations.push({
		...association,
		inviteCode: association.permissions.MANAGE_INVITE_LINK.includes(userId)
			? await AssociationRepository.findInviteCodeById(association.id)
			: undefined,
	});
}

const i18n = i18next.createInstance();
await i18n.use(initReactI18next).init({
	lng: "en",
	ns: NAMESPACES,
	defaultNS: "common",
	keySeparator: false,
	interpolation: { escapeValue: false },
	resources: {
		en: Object.fromEntries(
			NAMESPACES.map((namespace) => [
				namespace,
				JSON.parse(fs.readFileSync(`locales/en/${namespace}.json`, "utf8")),
			]),
		),
	},
});

const handler = createStaticHandler([
	{
		id: "associations",
		path: "/associations",
		Component: AssociationsPage,
		loader: () => loaderData,
	},
]);
const context = await handler.query(
	new Request("http://localhost/associations"),
);
if (context instanceof Response) throw new Error("Unexpected response");

const user = { id: userId } as React.ComponentProps<typeof UserProvider>["user"];

// biome-ignore lint/suspicious/noConsole: CLI script output
console.log("ready");
for await (const _line of readline.createInterface({ input: process.stdin })) {
	let html = "";
	const startedAt = performance.now();
	for (let i = 0; i < iterations; i++) {
		// a router per render, as each request gets on the server
		const router = createStaticRouter(handler.dataRoutes, context);
		html = renderToString(
			<I18nextProvider i18n={i18n}>
				<UserProvider user={user}>
					<StaticRouterProvider
						router={router}
						context={context}
						hydrate={false}
					/>
				</UserProvider>
			</I18nextProvider>,
		);
	}

	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log(
		JSON.stringify({
			microsecondsPerRender:
				((performance.now() - startedAt) / iterations) * 1000,
			htmlBytes: Buffer.byteLength(html),
		}),
	);
}
process.exit(0);

// src/routes/__root.tsx
/// <reference types="vite/client" />

import "../modules/i18n/init";
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Main } from "~/components/Main";
import commonCss from "../styles/common.css?url";
import flagsCss from "../styles/flags.css?url";
import normalizeCss from "../styles/normalize.css?url";
import utilsCss from "../styles/utils.css?url";
import varsCss from "../styles/vars.css?url";

export const Route = createRootRoute({
	head: () => ({
		// xxx: real meta
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "TanStack Start Starter",
			},
		],
		links: [
			{
				rel: "preconnect",
				href: "https://fonts.googleapis.com",
			},
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&display=swap",
			},
			{
				rel: "stylesheet",
				href: commonCss,
			},
			{
				rel: "stylesheet",
				href: flagsCss,
			},
			{
				rel: "stylesheet",
				href: normalizeCss,
			},
			{
				rel: "stylesheet",
				href: utilsCss,
			},
			{
				rel: "stylesheet",
				href: varsCss,
			},
		],
	}),
	component: RootComponent,
});

function RootComponent() {
	return (
		<RootDocument>
			<Main>
				<Outlet />
			</Main>
		</RootDocument>
	);
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en" className="dark">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}

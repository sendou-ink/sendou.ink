// The React twin of the slice's stand-in shell (src/routes/+layout.svelte), see plugin.ts
import * as React from "react";
import { Avatar } from "~/components/Avatar";
import type { RootLoaderData } from "~/root";
import styles from "./StandInLayout.module.css";

export const NPROGRESS_ANCHOR_ID = "nprogress-anchor";

export function Layout({
	children,
	data,
}: {
	children: React.ReactNode;
	data?: RootLoaderData;
}) {
	const user = data?.user;

	// scripts/measure.ts times hydration up to this mark, the slice's layout sets the same one
	React.useEffect(() => {
		performance.mark("sendou:hydrated");
	}, []);

	return (
		<div className={styles.container}>
			<header className={styles.header} data-stand-in-shell>
				<a href="/" className={styles.siteName}>
					sendou.ink
				</a>
				{user ? <Avatar user={user} size="xxsm" alt={user.username} /> : null}
				<div id={NPROGRESS_ANCHOR_ID} aria-hidden />
			</header>
			{children}
		</div>
	);
}

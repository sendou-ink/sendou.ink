/** A view whose session or VoD is no longer in the local store. */
import type * as React from "react";
import { Link } from "react-router";
import { SCANNER_PAGE } from "~/utils/urls";
import { scannerSearchParams } from "../scanner-search-params";
import styles from "./NotFound.module.css";

export function NotFound({ children }: { children: React.ReactNode }) {
	return (
		<div className={styles.notFound}>
			<p>{children}</p>
			<Link
				to={scannerSearchParams.href(SCANNER_PAGE, {})}
				defaultShouldRevalidate={false}
			>
				← Back to the scanner
			</Link>
		</div>
	);
}

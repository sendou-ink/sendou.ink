import clsx from "clsx";
import { CircleX, Trash2, TriangleAlert } from "lucide-react";
import * as React from "react";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import * as ConsoleCapture from "../../core/ConsoleCapture";
import * as ServerConsoleFeed from "../../core/ServerConsoleFeed";
import type { DevApp } from "../../dev-tools-types";
import { CopyButton, DevBadge, DevChip, DevDisclosure } from "../DevUi";
import styles from "./WarningsApp.module.css";

export const warningsDevApp: DevApp = {
	id: "warnings",
	title: "Warnings",
	description:
		"Errors & warnings of this tab and the dev server, hydration mismatches included",
	icon: <TriangleAlert />,
	badge: <WarningsBadge />,
	size: "md",
	Component: WarningsApp,
	install: ServerConsoleFeed.install,
};

const FILTERS = [
	{ key: "all", label: "All" },
	{ key: "error", label: "Errors" },
	{ key: "warn", label: "Warnings" },
	{ key: "hydration", label: "Hydration" },
	{ key: "server", label: "Server" },
] as const;

interface WarningRow {
	key: string;
	level: "error" | "warn";
	source: string;
	/** The request the server was handling when it logged this. */
	path: string | null;
	message: string;
	count: number;
	lastAt: number;
	isServer: boolean;
}

function WarningsApp() {
	const rows = useWarningRows();
	const [filter, setFilter] =
		React.useState<(typeof FILTERS)[number]["key"]>("all");

	const shown = rows.filter((row) => {
		if (filter === "all") return true;
		if (filter === "server") return row.isServer;
		if (filter === "hydration") {
			return ConsoleCapture.isHydrationMessage(row.message);
		}
		return row.level === filter;
	});

	return (
		<div className="stack md">
			<div className="stack horizontal sm items-center justify-between">
				<SendouChipRadioGroup>
					{FILTERS.map((option) => (
						<SendouChipRadio
							key={option.key}
							name="warning-filter"
							value={option.key}
							checked={filter === option.key}
							onChange={() => setFilter(option.key)}
						>
							{option.label}
						</SendouChipRadio>
					))}
				</SendouChipRadioGroup>
				<SendouButton
					variant="outlined"
					size="small"
					icon={<Trash2 />}
					onClick={() => {
						ConsoleCapture.clear();
						void ServerConsoleFeed.clear();
					}}
					isDisabled={rows.length === 0}
				>
					Clear
				</SendouButton>
			</div>

			{shown.length === 0 ? (
				<p className="no-results">
					{rows.length === 0
						? "Nothing logged since the page loaded"
						: "Nothing matches the filter"}
				</p>
			) : null}

			<ol className={styles.list}>
				{shown.map((row) => {
					const [firstLine, ...restLines] = row.message.split("\n");

					return (
						<li
							key={row.key}
							className={clsx(styles.entry, {
								[styles.entryError]: row.level === "error",
							})}
						>
							{row.level === "error" ? (
								<CircleX className="text-error small-icon" aria-label="Error" />
							) : (
								<TriangleAlert
									className="text-warning small-icon"
									aria-label="Warning"
								/>
							)}
							<div className={styles.content}>
								<div className="stack horizontal xs items-center flex-wrap">
									<DevChip tone={row.isServer ? "accent" : "neutral"}>
										{row.source}
									</DevChip>
									{row.path ? (
										<code className="text-xs text-lighter">{row.path}</code>
									) : null}
									{ConsoleCapture.isHydrationMessage(row.message) ? (
										<DevChip tone="warning">hydration</DevChip>
									) : null}
									{row.count > 1 ? (
										<DevChip tone="info">×{row.count}</DevChip>
									) : null}
									<span className="ml-auto">
										<CopyButton text={row.message} label="Copy message" />
									</span>
								</div>
								{restLines.length > 0 ? (
									<DevDisclosure
										summary={
											<code className={styles.message}>{firstLine}</code>
										}
									>
										<pre className={styles.message}>{restLines.join("\n")}</pre>
									</DevDisclosure>
								) : (
									<code className={styles.message}>{firstLine}</code>
								)}
							</div>
						</li>
					);
				})}
			</ol>

			<p className="text-xs text-lighter">
				Recorded since the page loaded, a full reload starts over. Server
				entries are the dev server's console errors & warnings, loader and
				action errors included, polled every few seconds.
			</p>
		</div>
	);
}

function WarningsBadge() {
	const rows = useWarningRows();

	return (
		<DevBadge
			count={rows.length}
			tone={rows.some((row) => row.level === "error") ? "error" : "warning"}
		/>
	);
}

function useWarningRows(): WarningRow[] {
	const clientEntries = React.useSyncExternalStore(
		ConsoleCapture.subscribe,
		ConsoleCapture.getSnapshot,
		ConsoleCapture.getSnapshot,
	);
	const serverEntries = React.useSyncExternalStore(
		ServerConsoleFeed.subscribe,
		ServerConsoleFeed.getSnapshot,
		ServerConsoleFeed.getSnapshot,
	);

	return [
		...clientEntries.map((entry) => ({
			key: `client-${entry.id}`,
			level: entry.level,
			source: entry.source,
			path: null,
			message: entry.message,
			count: entry.count,
			lastAt: entry.lastAt,
			isServer: false,
		})),
		...serverEntries.map((entry) => ({
			key: `server-${entry.id}`,
			level: entry.level,
			source: `server ${entry.level === "error" ? "error" : "warning"}`,
			path: entry.path,
			message: entry.message,
			count: entry.count,
			lastAt: entry.lastAt,
			isServer: true,
		})),
	].sort((a, b) => b.lastAt - a.lastAt);
}

import clsx from "clsx";
import { ArrowLeft, Database, Pause, Play, Trash2 } from "lucide-react";
import * as React from "react";
import { useFetcher } from "react-router";
import { Alert } from "~/components/Alert";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { SendouSwitch } from "~/components/elements/Switch";
import { Table } from "~/components/Table";
import { postDev } from "../../core/dev-api";
import type { RequestKind } from "../../core/RequestLog.server";
import type { DevApp } from "../../dev-tools-types";
import { DEV_REQUESTS_URL, devRequestUrl } from "../../dev-tools-urls";
import type { DevRequestsLoaderData } from "../../routes/dev.requests";
import type { DevRequestLoaderData } from "../../routes/dev.requests.$id";
import { CopyButton, DevChip } from "../DevUi";
import styles from "./RequestsApp.module.css";

export const requestsDevApp: DevApp = {
	id: "requests",
	title: "Requests",
	description: "The latest requests the server handled and their SQL",
	icon: <Database />,
	size: "lg",
	Component: RequestsApp,
};

const POLL_INTERVAL_MS = 2000;
const SLOW_REQUEST_MS = 200;
const SLOW_QUERY_MS = 10;

const KIND_FILTERS = [
	{ key: "all", label: "All" },
	{ key: "document", label: "Document" },
	{ key: "data", label: "Data" },
	{ key: "action", label: "Action" },
	{ key: "resource", label: "Resource" },
] as const satisfies ReadonlyArray<{ key: RequestKind | "all"; label: string }>;

const KIND_TONE = {
	document: "info",
	data: "success",
	action: "accent",
	resource: "neutral",
} as const;

function RequestsApp() {
	const [selectedId, setSelectedId] = React.useState<number | null>(null);

	if (selectedId !== null) {
		return (
			<RequestDetails id={selectedId} onBack={() => setSelectedId(null)} />
		);
	}

	return <RequestList onSelect={setSelectedId} />;
}

function RequestList({ onSelect }: { onSelect: (id: number) => void }) {
	const { load, data } = useFetcher<DevRequestsLoaderData>();
	const [isPaused, setIsPaused] = React.useState(false);
	const [kind, setKind] =
		React.useState<(typeof KIND_FILTERS)[number]["key"]>("all");
	const [onlyRepeated, setOnlyRepeated] = React.useState(false);

	React.useEffect(() => {
		load(DEV_REQUESTS_URL);
		if (isPaused) return;

		const interval = window.setInterval(
			() => load(DEV_REQUESTS_URL),
			POLL_INTERVAL_MS,
		);
		return () => window.clearInterval(interval);
	}, [load, isPaused]);

	if (!data) return null;

	const requests = data.requests.filter(
		(request) =>
			(kind === "all" || request.kind === kind) &&
			(!onlyRepeated || request.mostRepeatedCount !== null),
	);

	return (
		<div className="stack md">
			<div className={styles.toolbar}>
				<SendouChipRadioGroup>
					{KIND_FILTERS.map((filter) => (
						<SendouChipRadio
							key={filter.key}
							name="request-kind"
							value={filter.key}
							checked={kind === filter.key}
							onChange={() => setKind(filter.key)}
						>
							{filter.label}
						</SendouChipRadio>
					))}
				</SendouChipRadioGroup>
				<div className="stack horizontal sm items-center">
					<SendouSwitch
						isSelected={onlyRepeated}
						onChange={setOnlyRepeated}
						size="small"
					>
						N+1 suspects
					</SendouSwitch>
					<SendouButton
						variant="outlined"
						size="small"
						icon={isPaused ? <Play /> : <Pause />}
						onClick={() => setIsPaused(!isPaused)}
					>
						{isPaused ? "Resume" : "Pause"}
					</SendouButton>
					<SendouButton
						variant="outlined"
						size="small"
						icon={<Trash2 />}
						onClick={async () => {
							await postDev(DEV_REQUESTS_URL);
							load(DEV_REQUESTS_URL);
						}}
					>
						Clear
					</SendouButton>
				</div>
			</div>

			{requests.length === 0 ? (
				<p className="no-results">
					{data.requests.length === 0
						? "No requests yet, navigate around the site"
						: "No request matches the filters"}
				</p>
			) : (
				<Table>
					<thead>
						<tr>
							<th>Request</th>
							<th className={styles.number}>Status</th>
							<th className={styles.number}>Time</th>
							<th className={styles.number}>Queries</th>
							<th className={styles.number}>SQL time</th>
						</tr>
					</thead>
					<tbody>
						{requests.map((request) => (
							<tr
								key={request.id}
								className={styles.row}
								onClick={() => onSelect(request.id)}
							>
								<td className={styles.path} title={request.path}>
									<DevChip tone={KIND_TONE[request.kind]}>
										{request.kind === "action" ? request.method : request.kind}
									</DevChip>{" "}
									<code>{request.path}</code>
								</td>
								<td
									className={clsx(styles.number, {
										"text-error": (request.status ?? 0) >= 400,
									})}
								>
									{request.status ?? "…"}
								</td>
								<td
									className={clsx(styles.number, {
										"text-warning":
											(request.durationMs ?? 0) >= SLOW_REQUEST_MS,
									})}
								>
									{formatMs(request.durationMs)}
								</td>
								<td className={styles.number}>
									{request.mostRepeatedCount ? (
										<DevChip
											tone="warning"
											title={`One statement ran ${request.mostRepeatedCount} times`}
										>
											×{request.mostRepeatedCount}
										</DevChip>
									) : null}{" "}
									{request.errorCount > 0 ? (
										<DevChip tone="error">{request.errorCount} failed</DevChip>
									) : null}{" "}
									{request.queryCount}
								</td>
								<td className={clsx(styles.number, "text-lighter")}>
									{formatMs(request.queryDurationMs)}
								</td>
							</tr>
						))}
					</tbody>
				</Table>
			)}
		</div>
	);
}

function RequestDetails({ id, onBack }: { id: number; onBack: () => void }) {
	const { load, data, state } = useFetcher<DevRequestLoaderData>();

	React.useEffect(() => {
		load(devRequestUrl(id));
	}, [load, id]);

	const back = (
		<SendouButton
			variant="minimal"
			size="small"
			icon={<ArrowLeft />}
			onClick={onBack}
		>
			All requests
		</SendouButton>
	);

	if (!data) {
		return state === "idle" ? (
			<div className="stack md items-start">
				{back}
				<p className="no-results">
					No longer in the log, it keeps the latest 100 requests
				</p>
			</div>
		) : null;
	}

	const { request, repeatedQueries } = data;
	const queryTotalMs = request.queries.reduce(
		(total, query) => total + query.durationMs,
		0,
	);

	return (
		<div className="stack md">
			<div className={styles.toolbar}>
				{back}
				<CopyButton
					text={request.queries
						.map(
							(query) => `${query.sql}; -- ${JSON.stringify(query.parameters)}`,
						)
						.join("\n")}
					label="Copy every query"
				/>
			</div>

			<code>
				{request.method} {request.path}
			</code>
			<div className={styles.stats}>
				<Stat label="Status" value={String(request.status ?? "…")} />
				<Stat label="Total" value={formatMs(request.durationMs)} />
				<Stat
					label="Queries"
					value={String(request.queries.length + request.droppedQueryCount)}
				/>
				<Stat label="SQL time" value={formatMs(queryTotalMs)} />
			</div>

			{repeatedQueries.length > 0 ? (
				<Alert variation="WARNING" tiny>
					<div className="stack xs">
						<b>Repeated statements, an N+1?</b>
						{repeatedQueries.map((query) => (
							<div key={query.sql} className="stack horizontal sm">
								<b>×{query.count}</b>
								<code>{query.sql}</code>
							</div>
						))}
					</div>
				</Alert>
			) : null}

			{request.queries.length === 0 ? (
				<p className="no-results">No queries</p>
			) : null}
			<ol className={styles.queries}>
				{request.queries.map((query, index) => (
					<li key={index} className={styles.query}>
						<div className="stack horizontal sm items-center text-xs">
							<span className="text-lighter">#{index + 1}</span>
							<span
								className={clsx("font-semi-bold", {
									"text-warning": query.durationMs >= SLOW_QUERY_MS,
								})}
							>
								{formatMs(query.durationMs)}
							</span>
							<CopyButton text={query.sql} label="Copy SQL" />
						</div>
						<code className={styles.sql}>{query.sql}</code>
						{query.parameters.length > 0 ? (
							<code className={clsx(styles.sql, "text-lighter")}>
								{JSON.stringify(query.parameters)}
							</code>
						) : null}
						{query.error ? (
							<code className={clsx(styles.sql, "text-error")}>
								{query.error}
							</code>
						) : null}
					</li>
				))}
			</ol>
			{request.droppedQueryCount > 0 ? (
				<span className="text-warning text-xs">
					…and {request.droppedQueryCount} more not kept
				</span>
			) : null}
		</div>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className={styles.stat}>
			<span className="text-lg font-semi-bold">{value}</span>
			<span className="text-xs text-lighter">{label}</span>
		</div>
	);
}

function formatMs(ms: number | null) {
	if (ms === null) return "…";
	if (ms < 10) return `${ms.toFixed(1)}ms`;

	return `${Math.round(ms)}ms`;
}

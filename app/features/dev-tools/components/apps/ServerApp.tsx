import { Database, Play, RefreshCw, Server } from "lucide-react";
import * as React from "react";
import { useFetcher, useRevalidator } from "react-router";
import { Alert } from "~/components/Alert";
import { SendouButton } from "~/components/elements/Button";
import { SendouSection } from "~/components/elements/Section";
import { SendouSwitch } from "~/components/elements/Switch";
import { postDev } from "../../core/dev-api";
import type { DEV_SWITCHES } from "../../dev-tools-schemas";
import type { DevApp } from "../../dev-tools-types";
import { DEV_SERVER_URL } from "../../dev-tools-urls";
import type {
	DevServerActionData,
	DevServerLoaderData,
} from "../../routes/dev.server";
import { DevChip } from "../DevUi";
import styles from "./ServerApp.module.css";

export const serverDevApp: DevApp = {
	id: "server",
	title: "Server",
	description: "Database, switches, caches and routines of this dev server",
	icon: <Server />,
	size: "md",
	Component: ServerApp,
};

type RoutineResult =
	| { status: "running" }
	| { status: "done"; ok: boolean; durationMs: number }
	| { status: "failed"; error: string };

const SWITCHES: Array<{
	key: (typeof DEV_SWITCHES)[number];
	label: string;
	description: string;
}> = [
	{
		key: "seasonEnded",
		label: "Season ended",
		description:
			"Seasons.current() resolves to null for now, as between two seasons",
	},
	{
		key: "plusVotingActive",
		label: "Plus voting active",
		description:
			"isVotingActive() is true, as during the monthly voting (locks new suggestions)",
	},
];

function ServerApp() {
	const { load, data } = useFetcher<DevServerLoaderData>();
	const revalidator = useRevalidator();
	const [pending, setPending] = React.useState<string | null>(null);
	const [message, setMessage] = React.useState<{
		isError: boolean;
		text: string;
	}>();
	const [isConfirmingReseed, setIsConfirmingReseed] = React.useState(false);
	const [routineResults, setRoutineResults] = React.useState<
		Record<string, RoutineResult>
	>({});

	React.useEffect(() => {
		load(DEV_SERVER_URL);
	}, [load]);

	const act = async (
		key: string,
		body: unknown,
		describeSuccess: (result: DevServerActionData) => string,
	) => {
		setPending(key);
		setMessage(undefined);
		const result = await postDev<DevServerActionData>(DEV_SERVER_URL, body);
		setPending(null);
		load(DEV_SERVER_URL);

		if (!result.ok) {
			setMessage({ isError: true, text: result.error });
			return false;
		}
		setMessage({ isError: false, text: describeSuccess(result.data) });
		// what the page shows may depend on what just changed
		void revalidator.revalidate();
		return true;
	};

	const runRoutine = async (name: string) => {
		setRoutineResults((results) => ({
			...results,
			[name]: { status: "running" },
		}));
		const result = await postDev<DevServerActionData>(DEV_SERVER_URL, {
			_action: "RUN_ROUTINE",
			name,
		});
		setRoutineResults((results) => ({
			...results,
			[name]: result.ok
				? {
						status: "done",
						ok: result.data.ok,
						durationMs: result.data.durationMs ?? 0,
					}
				: { status: "failed", error: result.error },
		}));
		if (result.ok) void revalidator.revalidate();
	};

	if (!data) return null;

	return (
		<div className="stack md">
			{message ? (
				<Alert variation={message.isError ? "ERROR" : "SUCCESS"} tiny>
					{message.text}
				</Alert>
			) : null}

			<SendouSection
				title="Database"
				icon={Database}
				action={
					isConfirmingReseed ? (
						<div className="stack horizontal xs items-center">
							<span className="text-xs text-error">Wipes every row, sure?</span>
							<SendouButton
								variant="minimal"
								size="miniscule"
								onClick={() => setIsConfirmingReseed(false)}
							>
								Cancel
							</SendouButton>
							<SendouButton
								variant="destructive"
								size="miniscule"
								isPending={pending === "reseed"}
								onClick={async () => {
									const ok = await act(
										"reseed",
										{ _action: "RESEED" },
										(result) => `Reseeded in ${seconds(result.durationMs)}`,
									);
									setIsConfirmingReseed(false);
									// the users and ids of the old data are gone
									if (ok) window.location.assign("/");
								}}
							>
								Wipe & reseed
							</SendouButton>
						</div>
					) : (
						<SendouButton
							variant="outlined-destructive"
							size="miniscule"
							isDisabled={!data.database.isReseedable}
							title={
								data.database.isReseedable
									? "Replaces all data with a fresh dev seed"
									: "Only db.sqlite3 can be reseeded from here"
							}
							onClick={() => setIsConfirmingReseed(true)}
						>
							Reseed
						</SendouButton>
					)
				}
			>
				<div className="stack horizontal sm items-center">
					<code className="font-bold">{data.database.file}</code>
					{data.database.isReseedable ? (
						<DevChip tone="success">dev database</DevChip>
					) : (
						<DevChip tone="warning">not the dev database</DevChip>
					)}
				</div>
				<p className="text-xs text-lighter">
					Web push is {data.webPushEnabled ? "configured" : "not configured"}.
					Nothing started from the dev tools ever sends one, so real devices
					can't be notified even on a copy of production data.
				</p>
			</SendouSection>

			<SendouSection title="Switches">
				<p className="text-xs text-lighter">
					In-memory overrides of this server process, gone on restart
				</p>
				{SWITCHES.map((devSwitch) => (
					<div key={devSwitch.key} className={styles.switchRow}>
						<SendouSwitch
							isSelected={data.switches[devSwitch.key]}
							isDisabled={pending === devSwitch.key}
							onChange={(value) =>
								act(
									devSwitch.key,
									{ _action: "SET_SWITCH", switch: devSwitch.key, value },
									() => `${devSwitch.label} ${value ? "on" : "off"}`,
								)
							}
							size="small"
						>
							{devSwitch.label}
						</SendouSwitch>
						<p className="text-xs text-lighter">{devSwitch.description}</p>
					</div>
				))}
			</SendouSection>

			<SendouSection
				title="Caches"
				action={
					<SendouButton
						variant="outlined"
						size="miniscule"
						icon={<RefreshCw />}
						isPending={pending === "caches"}
						onClick={() =>
							act(
								"caches",
								{ _action: "REFRESH_CACHES" },
								(result) => `Caches refreshed in ${seconds(result.durationMs)}`,
							)
						}
					>
						Refresh
					</SendouButton>
				}
			>
				<p className="text-xs text-lighter">
					In-process caches (tournaments, SendouQ, user cards, banned users…).
					Refresh after editing the database by hand.
				</p>
			</SendouSection>

			<SendouSection title="Routines">
				<p className="text-xs text-lighter">
					Cron jobs, run now instead of waiting for their schedule. Failures are
					logged in the terminal.
				</p>
				{data.routineSchedules.map((schedule) => (
					<div key={schedule.schedule} className="stack xxs">
						<h4 className="text-xxs text-lighter text-uppercase font-semi-bold">
							{schedule.schedule}
						</h4>
						{schedule.names.map((name) => {
							const result = routineResults[name];

							return (
								<div key={name} className={styles.routine}>
									<code className="text-xs">{name}</code>
									<RoutineResultChip result={result} />
									<SendouButton
										variant="minimal"
										size="miniscule"
										icon={<Play />}
										aria-label={`Run ${name}`}
										isPending={result?.status === "running"}
										onClick={() => runRoutine(name)}
									/>
								</div>
							);
						})}
					</div>
				))}
			</SendouSection>
		</div>
	);
}

function RoutineResultChip({ result }: { result?: RoutineResult }) {
	if (!result || result.status === "running") return null;
	if (result.status === "failed") {
		return <DevChip tone="error">{result.error}</DevChip>;
	}

	return result.ok ? (
		<DevChip tone="success">ok · {seconds(result.durationMs)}</DevChip>
	) : (
		<DevChip tone="error">threw, see terminal</DevChip>
	);
}

function seconds(ms: number | null) {
	if (ms === null) return "";

	return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

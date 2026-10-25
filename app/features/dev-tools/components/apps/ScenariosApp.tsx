import { Play, Search, WandSparkles } from "lucide-react";
import * as React from "react";
import { useFetcher } from "react-router";
import { Alert } from "~/components/Alert";
import { Divider } from "~/components/Divider";
import { SendouButton } from "~/components/elements/Button";
import { SendouLabel } from "~/components/elements/Label";
import { SendouSection } from "~/components/elements/Section";
import { SendouSwitch } from "~/components/elements/Switch";
import { Input } from "~/components/Input";
import {
	usePersistedMapState,
	usePersistedState,
} from "~/modules/persisted-state/hooks";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import { postDev } from "../../core/dev-api";
import {
	scenarioLogInPersisted,
	scenarioParamsPersisted,
} from "../../dev-tools-persisted";
import type { DevApp } from "../../dev-tools-types";
import { DEV_SCENARIOS_URL } from "../../dev-tools-urls";
import type {
	DevScenarioActionData,
	DevScenariosLoaderData,
} from "../../routes/dev.scenarios";
import { CopyButton } from "../DevUi";
import styles from "./ScenariosApp.module.css";

export const scenariosDevApp: DevApp = {
	id: "scenarios",
	title: "Scenarios",
	description: "Build a ready-made state out of fresh users and jump in",
	icon: <WandSparkles />,
	size: "md",
	Component: ScenariosApp,
};

type ScenarioListItem = DevScenariosLoaderData["scenarios"][number];
type ParamValues = Record<string, string | number>;

function ScenariosApp() {
	const { load, data } = useFetcher<DevScenariosLoaderData>();
	const [filter, setFilter] = React.useState("");
	const [logIn, setLogIn] = usePersistedState(scenarioLogInPersisted);
	const [runningId, setRunningId] = React.useState<string | null>(null);
	const [error, setError] = React.useState<{ id: string; message: string }>();

	React.useEffect(() => {
		load(DEV_SCENARIOS_URL);
	}, [load]);

	const run = async (scenario: ScenarioListItem, params: ParamValues) => {
		setRunningId(scenario.id);
		setError(undefined);

		const result = await postDev<DevScenarioActionData>(DEV_SCENARIOS_URL, {
			scenarioId: scenario.id,
			params,
		});
		if (!result.ok) {
			setRunningId(null);
			setError({ id: scenario.id, message: result.error });
			return;
		}

		// a full page load, the root loader has to see who is logged in now
		window.location.assign(logIn ? result.data.logInUrl : result.data.path);
	};

	if (!data) return null;

	const query = filter.trim().toLowerCase();
	const scenarios = data.scenarios.filter((scenario) =>
		`${scenario.title} ${scenario.description} ${scenario.category} ${scenario.id}`
			.toLowerCase()
			.includes(query),
	);
	const categories = [
		...new Set(scenarios.map((scenario) => scenario.category)),
	];

	return (
		<div className="stack md">
			<div className={styles.controls}>
				<Input
					className={styles.filter}
					placeholder="Filter scenarios"
					aria-label="Filter scenarios"
					value={filter}
					onChange={(event) => setFilter(event.target.value)}
					icon={<Search />}
					autoFocus
				/>
				<SendouSwitch isSelected={logIn} onChange={setLogIn} size="small">
					Log in as its user
				</SendouSwitch>
			</div>

			{categories.length === 0 ? (
				<p className="no-results">No scenario matches "{filter}"</p>
			) : null}

			{categories.map((category) => (
				<div key={category} className="stack sm">
					<Divider smallText>{category}</Divider>
					{scenarios
						.filter((scenario) => scenario.category === category)
						.map((scenario) => (
							<ScenarioCard
								key={scenario.id}
								scenario={scenario}
								isRunning={runningId === scenario.id}
								isDisabled={runningId !== null}
								error={error?.id === scenario.id ? error.message : null}
								onRun={(params) => run(scenario, params)}
							/>
						))}
				</div>
			))}
		</div>
	);
}

function ScenarioCard({
	scenario,
	isRunning,
	isDisabled,
	error,
	onRun,
}: {
	scenario: ScenarioListItem;
	isRunning: boolean;
	isDisabled: boolean;
	error: string | null;
	onRun: (params: ParamValues) => void;
}) {
	const id = React.useId();
	const storedParams = usePersistedMapState(scenarioParamsPersisted)[
		scenario.id
	];
	const params: ParamValues = Object.fromEntries(
		scenario.params.map((param) => [
			param.key,
			storedParams?.[param.key] ?? param.default,
		]),
	);

	const setParam = (key: string, value: string | number) =>
		PersistedState.writeMapEntry(scenarioParamsPersisted, scenario.id, {
			...params,
			[key]: value,
		});

	const cliCommand = [
		`pnpm run dev:tools scenario ${scenario.id}`,
		...scenario.params
			.filter((param) => params[param.key] !== param.default)
			.map((param) => `--${param.key}=${params[param.key]}`),
	].join(" ");

	return (
		<SendouSection
			title={scenario.title}
			action={
				<div className="stack horizontal xs items-center">
					<CopyButton text={cliCommand} label={`Copy CLI: ${cliCommand}`} />
					<SendouButton
						size="small"
						icon={<Play />}
						isPending={isRunning}
						isDisabled={isDisabled && !isRunning}
						onClick={() => onRun(params)}
					>
						Run
					</SendouButton>
				</div>
			}
		>
			<p className="text-xs text-lighter">{scenario.description}</p>
			{scenario.params.length > 0 ? (
				<div className={styles.params}>
					{scenario.params.map((param) => {
						const inputId = `${id}-${param.key}`;

						return (
							<div key={param.key}>
								<SendouLabel htmlFor={inputId}>{param.label}</SendouLabel>
								{param.kind === "select" ? (
									<select
										id={inputId}
										value={params[param.key]}
										onChange={(event) =>
											setParam(param.key, event.target.value)
										}
									>
										{param.options.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
								) : (
									<Input
										id={inputId}
										type="number"
										className={styles.numberInput}
										min={param.min}
										max={param.max}
										value={String(params[param.key])}
										onChange={(event) => {
											const value = event.target.valueAsNumber;
											if (Number.isInteger(value)) setParam(param.key, value);
										}}
									/>
								)}
							</div>
						);
					})}
				</div>
			) : null}
			{error ? (
				<Alert variation="ERROR" tiny>
					{error}
				</Alert>
			) : null}
		</SendouSection>
	);
}

import { Check, FileSearch, Trash2, X } from "lucide-react";
import * as React from "react";
import { useFetcher, useLocation, useMatches, useNavigate } from "react-router";
import { Alert } from "~/components/Alert";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouSection } from "~/components/elements/Section";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { Input } from "~/components/Input";
import { Table } from "~/components/Table";
import { useUser } from "~/features/auth/core/user";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import * as SearchParams from "~/modules/search-params/search-params";
import * as SearchParamsStore from "~/modules/search-params/store";
import * as BrowserState from "../../core/BrowserState";
import * as PageInspection from "../../core/PageInspection";
import type { DevApp } from "../../dev-tools-types";
import { devUsersUrl } from "../../dev-tools-urls";
import type { DevUsersLoaderData } from "../../routes/dev.users";
import { CopyButton, DevChip, DevDisclosure, OpenInEditor } from "../DevUi";
import { JsonTree } from "../JsonTree";
import styles from "./PageApp.module.css";

export const pageDevApp: DevApp = {
	id: "page",
	title: "Page",
	description:
		"What this page is made of: loader data, permissions, URL & storage",
	icon: <FileSearch />,
	size: "lg",
	Component: PageApp,
};

const LARGE_ROUTE_DATA_BYTES = 50 * 1024;

const PARAM_STATUS_TONE = {
	ok: "success",
	default: "neutral",
	redundant: "warning",
	"non-canonical": "info",
	invalid: "error",
} as const;

function PageApp() {
	return (
		<SendouTabs defaultSelectedKey="data" padded={false}>
			<SendouTabList>
				<SendouTab id="data">Loader data</SendouTab>
				<SendouTab id="permissions">Permissions</SendouTab>
				<SendouTab id="state">URL & storage</SendouTab>
			</SendouTabList>
			<SendouTabPanel id="data" className={styles.panel}>
				<LoaderDataTab />
			</SendouTabPanel>
			<SendouTabPanel id="permissions" className={styles.panel}>
				<PermissionsTab />
			</SendouTabPanel>
			<SendouTabPanel id="state" className={styles.panel}>
				<div className="stack md">
					<UrlParamsSection />
					<StorageSection />
				</div>
			</SendouTabPanel>
		</SendouTabs>
	);
}

function LoaderDataTab() {
	const matches = useMatches();
	const routes = matches.map((match) => ({
		id: match.id,
		data: match.loaderData,
		bytes: PageInspection.jsonByteSize(match.loaderData),
	}));
	const totalBytes = routes.reduce((sum, route) => sum + route.bytes, 0);

	return (
		<div className="stack sm">
			<p className="text-xs text-lighter">
				{routes.length} matched routes, {PageInspection.formatBytes(totalBytes)}{" "}
				of loader data as JSON
			</p>
			{routes.map((route) => (
				<div key={route.id} className={styles.card}>
					<DevDisclosure
						summary={
							<span className={styles.routeSummary}>
								<RouteName id={route.id} />
								<DevChip
									tone={
										route.bytes > LARGE_ROUTE_DATA_BYTES ? "warning" : "neutral"
									}
								>
									{PageInspection.formatBytes(route.bytes)}
								</DevChip>
							</span>
						}
					>
						{route.data === undefined ? (
							<span className="text-xs text-lighter">No loader</span>
						) : (
							<>
								<div className="stack items-end">
									<CopyButton
										text={JSON.stringify(route.data, null, 2)}
										label="Copy as JSON"
									/>
								</div>
								<JsonTree value={route.data} />
							</>
						)}
					</DevDisclosure>
				</div>
			))}
		</div>
	);
}

function RouteName({ id }: { id: string }) {
	const file = routeModuleFile(id);

	return (
		<span className={styles.routeName}>
			{file ? <OpenInEditor file={file}>{id}</OpenInEditor> : id}
		</span>
	);
}

function PermissionsTab() {
	const user = useUser();
	const matches = useMatches();
	const found = matches.flatMap((match) =>
		PageInspection.findPermissions(match.loaderData).map((entry) => ({
			...entry,
			routeId: match.id,
		})),
	);

	const userIds = [
		...new Set(
			found.flatMap((entry) => Object.values(entry.permissions).flat()),
		),
	].sort((a, b) => a - b);
	const { load, data } = useFetcher<DevUsersLoaderData>();
	const userIdsKey = userIds.join(",");

	React.useEffect(() => {
		if (userIdsKey) load(devUsersUrl(userIdsKey.split(",").map(Number)));
	}, [load, userIdsKey]);

	const userById = new Map(data?.users.map((row) => [row.id, row]));

	return (
		<div className="stack md">
			<SendouSection title="Your global roles">
				<p className="text-xs text-lighter">
					Checked with requireRole() / useHasRole(), independent of the objects
					below
				</p>
				<div className={styles.chips}>
					{user?.plusTier ? (
						<DevChip tone="accent">+{user.plusTier}</DevChip>
					) : null}
					{user?.roles.map((role) => (
						<DevChip key={role} tone="info">
							{role}
						</DevChip>
					))}
					{!user ? <DevChip>Logged out</DevChip> : null}
					{user && user.roles.length === 0 && !user.plusTier ? (
						<DevChip>None</DevChip>
					) : null}
				</div>
			</SendouSection>

			<SendouSection title="Per-object permissions">
				<p className="text-xs text-lighter">
					Every permissions object in this page's loader data. Admins bypass
					them in production only. Not listed: grants open to a class of users
					and checks on derived state, see docs/dev/permissions.md.
				</p>
				{found.length === 0 ? (
					<p className="no-results">
						No permissions objects in this page's loader data
					</p>
				) : null}
				{found.map((entry) => (
					<div key={`${entry.routeId} ${entry.path}`} className="stack xs">
						<div className="stack horizontal sm items-center flex-wrap">
							<code>{entry.path}</code>
							{entry.label ? <DevChip>{entry.label}</DevChip> : null}
							<span className="text-xxs text-lighter ml-auto">
								{entry.routeId}
							</span>
						</div>
						<Table noRowHover>
							<tbody>
								{Object.entries(entry.permissions).map(([name, ids]) => {
									const hasIt = Boolean(user && ids.includes(user.id));

									return (
										<tr key={name}>
											<td>
												<span className={styles.permissionName}>
													{hasIt ? (
														<Check
															className="text-success small-icon"
															aria-label="You have it"
														/>
													) : (
														<X
															className="text-lighter small-icon"
															aria-label="You lack it"
														/>
													)}
													<code>{name}</code>
												</span>
											</td>
											<td className="w-full">
												{ids.length === 0 ? (
													<span className="text-lighter">Nobody</span>
												) : (
													<div className={styles.chips}>
														{ids.map((id) => {
															const holder = userById.get(id);

															return (
																<DevChip
																	key={id}
																	tone={id === user?.id ? "success" : "neutral"}
																>
																	{holder ? (
																		<Avatar user={holder} size="xxxs" />
																	) : null}
																	&nbsp;{holder?.username ?? "User"} #{id}
																</DevChip>
															);
														})}
													</div>
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</Table>
					</div>
				))}
			</SendouSection>
		</div>
	);
}

function UrlParamsSection() {
	const location = useLocation();
	const navigate = useNavigate();
	const matches = useMatches();
	// `loader: false` params are written with replaceState, invisible to the router
	const search = React.useSyncExternalStore(
		SearchParamsStore.subscribe,
		() => window.location.search,
		() => location.search,
	);
	const [newKey, setNewKey] = React.useState("");
	const [newValue, setNewValue] = React.useState("");

	React.useSyncExternalStore(
		SearchParams.subscribeDevTools,
		SearchParams.devToolsSnapshot,
		SearchParams.devToolsSnapshot,
	);

	const featureFolders = matches.flatMap((match) => {
		const folder = match.id.match(/^features\/([^/]+)\//)?.[1];
		return folder ? [`app/features/${folder}/`] : [];
	});
	const routeModules = (
		window as unknown as {
			__reactRouterRouteModules?: Record<
				string,
				{ shouldRevalidate?: unknown } | undefined
			>;
		}
	).__reactRouterRouteModules;
	const routeRevalidators = new Set(
		matches.map((match) => routeModules?.[match.id]?.shouldRevalidate),
	);
	const described = BrowserState.describeSearchParams({
		search,
		definitions: SearchParams.definitionsForDevTools(),
		isPageSource: (source) =>
			featureFolders.some((folder) => source.startsWith(folder)),
		isRouteRevalidator: (definition) =>
			routeRevalidators.has(definition.shouldRevalidate),
	});

	const setParam = (key: string, values: string[]) => {
		const next = new URLSearchParams(search);
		next.delete(key);
		for (const value of values) next.append(key, value);
		const nextSearch = next.toString();
		navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}`, {
			replace: true,
			preventScrollReset: true,
		});
	};

	return (
		<SendouSection title="Search params">
			<p className="text-xs text-lighter">
				Definitions this page reads, grouped by where they are declared. Click a
				value to edit it.
			</p>
			{described.unknownKeys.length > 0 ? (
				<Alert variation="WARNING" tiny>
					Not declared by any loaded definition:{" "}
					{described.unknownKeys.map((key) => (
						<span key={key} className="stack horizontal xxs items-center">
							<code>{key}</code>
							<SendouButton
								variant="minimal-destructive"
								size="miniscule"
								icon={<Trash2 />}
								aria-label={`Remove ${key}`}
								onClick={() => setParam(key, [])}
							/>
						</span>
					))}
				</Alert>
			) : null}
			{described.page.length === 0 && described.shared.length === 0 ? (
				<p className="no-results">
					No search params definition is in use on this page
				</p>
			) : null}
			{described.page.length > 0 ? (
				<SearchParamsGroup
					title="This page"
					definitions={described.page}
					setParam={setParam}
				/>
			) : null}
			{described.shared.length > 0 ? (
				<SearchParamsGroup
					title="App-wide"
					definitions={described.shared}
					setParam={setParam}
				/>
			) : null}
			{described.unused.length > 0 ? (
				<DevDisclosure
					summary={
						<span className="text-xs">
							Not used by this page ({described.unused.length})
						</span>
					}
				>
					<p className="text-xs text-lighter">
						Loaded definitions of this page's features or declaring a param name
						of the URL, but no mounted component reads them and no matched route
						revalidates by them
					</p>
					{described.unused.map((definition) => (
						<DefinitionParams
							key={definitionKey(definition)}
							definition={definition}
							setParam={setParam}
						/>
					))}
				</DevDisclosure>
			) : null}
			<form
				className="stack horizontal sm"
				onSubmit={(event) => {
					event.preventDefault();
					if (!newKey.trim()) return;
					setParam(newKey.trim(), [newValue]);
					setNewKey("");
					setNewValue("");
				}}
			>
				<Input
					placeholder="param"
					aria-label="Param name"
					value={newKey}
					onChange={(event) => setNewKey(event.target.value)}
				/>
				<Input
					placeholder="value"
					aria-label="Param value"
					value={newValue}
					onChange={(event) => setNewValue(event.target.value)}
				/>
				<SendouButton type="submit" variant="outlined">
					Set
				</SendouButton>
			</form>
		</SendouSection>
	);
}

type DescribedDefinition = ReturnType<
	typeof BrowserState.describeSearchParams
>["page"][number];

function SearchParamsGroup({
	title,
	definitions,
	setParam,
}: {
	title: string;
	definitions: DescribedDefinition[];
	setParam: (key: string, values: string[]) => void;
}) {
	return (
		<div className="stack sm">
			<h4 className={styles.groupTitle}>{title}</h4>
			{definitions.map((definition) => (
				<DefinitionParams
					key={definitionKey(definition)}
					definition={definition}
					setParam={setParam}
				/>
			))}
		</div>
	);
}

function DefinitionParams({
	definition,
	setParam,
}: {
	definition: DescribedDefinition;
	setParam: (key: string, values: string[]) => void;
}) {
	const fallbackName = definition.source
		? fileBaseName(definition.source)
		: "Unknown module";

	return (
		<div className="stack xs">
			<div className={styles.definitionHeader}>
				<React.Suspense
					fallback={<code className={styles.definitionName}>…</code>}
				>
					<DefinitionName
						declaredAt={definition.declaredAt}
						fallback={fallbackName}
					/>
				</React.Suspense>
				{definition.readers > 0 ? (
					<DevChip
						tone="success"
						title="Mounted components reading it through useSearchParamsTyped / useSearchParam"
					>
						{definition.readers}{" "}
						{definition.readers === 1 ? "reader" : "readers"}
					</DevChip>
				) : null}
				{definition.revalidatesRoute ? (
					<DevChip
						tone="info"
						title="A matched route exports its shouldRevalidate, loader params rerun the loader"
					>
						route loader
					</DevChip>
				) : null}
				{definition.source ? (
					<span className="ml-auto">
						<OpenInEditor file={definition.source}>
							{definition.source}
						</OpenInEditor>
					</span>
				) : null}
			</div>
			<Table noRowHover>
				<tbody>
					{definition.params.map((param) => (
						<ParamRow
							key={param.key}
							param={param}
							onSet={(values) => setParam(param.key, values)}
						/>
					))}
				</tbody>
			</Table>
		</div>
	);
}

function DefinitionName({
	declaredAt,
	fallback,
}: {
	declaredAt: DescribedDefinition["declaredAt"];
	fallback: string;
}) {
	const moduleCode = declaredAt
		? React.use(fetchModuleCode(declaredAt.url))
		: "";
	const name = declaredAt
		? BrowserState.declaredName(moduleCode, declaredAt.line)
		: null;

	return <code className={styles.definitionName}>{name ?? fallback}</code>;
}

function ParamRow({
	param,
	onSet,
}: {
	param: DescribedDefinition["params"][number];
	onSet: (values: string[]) => void;
}) {
	const [draft, setDraft] = React.useState<string | null>(null);
	const rawValue = param.raw[0] ?? "";

	const applyDraft = (value: string) => {
		if (value !== rawValue) onSet(value === "" ? [] : [value]);
		setDraft(null);
	};

	return (
		<tr>
			<td className="whitespace-nowrap">
				<code>{param.key}</code>
				{param.isLoaderParam ? (
					<span
						className="text-xxs text-lighter"
						title="Changing it runs loaders"
					>
						{" "}
						loader
					</span>
				) : null}
			</td>
			<td>
				<DevChip tone={PARAM_STATUS_TONE[param.status]}>{param.status}</DevChip>
			</td>
			<td className="w-full">
				{draft !== null ? (
					<form
						onSubmit={(event) => {
							event.preventDefault();
							applyDraft(draft);
						}}
					>
						<Input
							aria-label={`Raw value of ${param.key}`}
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
							onKeyDown={(event) => {
								if (event.key !== "Escape") return;
								event.preventDefault();
								setDraft(null);
							}}
							onBlur={() => applyDraft(draft)}
							autoFocus
						/>
					</form>
				) : (
					<button
						type="button"
						className={styles.valueButton}
						title="Click to edit the raw value, Enter or click away applies, Esc cancels"
						onClick={() => setDraft(rawValue)}
					>
						<code>{JSON.stringify(param.decoded)}</code>
						{param.raw.length > 0 && param.status !== "ok" ? (
							<span className="text-xxs text-lighter">
								{" "}
								from {JSON.stringify(param.raw.join("&"))}
							</span>
						) : null}
					</button>
				)}
			</td>
			<td>
				{param.raw.length > 0 ? (
					<SendouButton
						variant="minimal-destructive"
						size="miniscule"
						icon={<Trash2 />}
						aria-label={`Remove ${param.key}`}
						onClick={() => onSet([])}
					/>
				) : null}
			</td>
		</tr>
	);
}

function StorageSection() {
	const [, rerender] = React.useReducer((count: number) => count + 1, 0);
	const described = BrowserState.describeStorage({
		entries: PersistedState.rawEntriesForDevTools(),
		definitions: PersistedState.definitionsForDevTools(),
	});

	const remove = (storage: "local" | "session", key: string) => {
		PersistedState.removeRawEntryForDevTools(storage, key);
		rerender();
	};

	const clearAll = () => {
		for (const row of described.rows) {
			// keeps the dev tools' own settings
			if (row.key.startsWith("dev-")) continue;
			PersistedState.removeRawEntryForDevTools(row.storage, row.key);
		}
		window.location.reload();
	};

	return (
		<SendouSection
			title="Web storage"
			action={
				<SendouButton
					variant="outlined-destructive"
					size="miniscule"
					onClick={clearAll}
				>
					Clear all & reload
				</SendouButton>
			}
		>
			<p className="text-xs text-lighter">
				localStorage & sessionStorage entries and the persisted state
				definitions owning them
			</p>
			{described.rows.length === 0 ? (
				<p className="no-results">Nothing stored</p>
			) : (
				<Table noRowHover>
					<tbody>
						{described.rows.map((row) => (
							<tr key={`${row.storage} ${row.key}`}>
								<td className="whitespace-nowrap">
									<code>{row.key}</code>
									<span className="text-xxs text-lighter"> {row.storage}</span>
								</td>
								<td>
									<DevChip
										tone={
											row.status === "ok"
												? "success"
												: row.status === "malformed"
													? "error"
													: "neutral"
										}
										title={
											row.status === "unknown"
												? "No loaded definition owns this key"
												: row.status === "malformed"
													? "Fails to decode, the default applies"
													: undefined
										}
									>
										{row.status}
									</DevChip>
								</td>
								<td className={styles.storageValue}>
									{row.status === "ok" ? (
										<JsonTree value={row.decoded} openDepth={0} />
									) : (
										<code>{truncate(row.raw, 160)}</code>
									)}
								</td>
								<td>
									<SendouButton
										variant="minimal-destructive"
										size="miniscule"
										icon={<Trash2 />}
										aria-label={`Remove ${row.key}`}
										onClick={() => remove(row.storage, row.key)}
									/>
								</td>
							</tr>
						))}
					</tbody>
				</Table>
			)}
			{described.unsetDefinitions.length > 0 ? (
				<p className="text-xs text-lighter">
					Using their default, nothing stored:{" "}
					{described.unsetDefinitions
						.map((definition) => BrowserState.definitionKey(definition))
						.join(", ")}
				</p>
			) : null}
		</SendouSection>
	);
}

function routeModuleFile(routeId: string) {
	const manifest = (
		window as unknown as {
			__reactRouterManifest?: {
				routes?: Record<string, { module?: string }>;
			};
		}
	).__reactRouterManifest;
	const module = manifest?.routes?.[routeId]?.module;

	return module?.startsWith("/app/") ? module.slice(1).split("?")[0] : null;
}

const moduleCodeByUrl = new Map<string, Promise<string>>();

function fetchModuleCode(url: string) {
	let promise = moduleCodeByUrl.get(url);
	if (!promise) {
		promise = fetch(url)
			.then((response) => (response.ok ? response.text() : ""))
			.catch(() => "");
		moduleCodeByUrl.set(url, promise);
	}

	return promise;
}

function definitionKey(definition: DescribedDefinition) {
	return `${definition.source} ${definition.params.map((param) => param.key).join()}`;
}

function fileBaseName(path: string) {
	return (
		path
			.split("/")
			.at(-1)
			?.replace(/\.tsx?$/, "") ?? path
	);
}

function truncate(text: string, length: number) {
	return text.length > length ? `${text.slice(0, length)}…` : text;
}

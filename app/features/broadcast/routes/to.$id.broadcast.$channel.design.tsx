import clsx from "clsx";
import {
	ArrowLeft,
	CornerDownRight,
	Play,
	RotateCcw,
	Undo2,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import {
	type SelectKey,
	SendouSelect,
	SendouSelectItem,
} from "~/components/elements/Select";
import { SendouSwitch } from "~/components/elements/Switch";
import { useTournament } from "~/features/tournament/tournament-context";
import { useUnsavedChangesChecker } from "~/form/UnsavedChangesGuard";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { useLatestRef } from "~/hooks/useLatestRef";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	BROADCAST_BRACKET_FOCUSES,
	BROADCAST_CSS_MAX_LENGTH,
	BROADCAST_DESIGN_BEST_OF,
	BROADCAST_DESIGN_BRACKETS,
	BROADCAST_DESIGN_FOOTAGE,
	BROADCAST_DESIGN_MAX_OTHER_MATCHES,
	BROADCAST_DESIGN_MAX_PLAYERS,
	BROADCAST_DESIGN_MESSAGE,
	BROADCAST_DESIGN_NAME_LENGTHS,
	BROADCAST_DESIGN_READY_MESSAGE,
	BROADCAST_DESIGN_SET_STAGES,
	BROADCAST_INK_COLORS,
	BROADCAST_MAX_CASTERS,
	BROADCAST_THEME_STYLESHEETS,
	BROADCAST_TRANSITIONS,
	BROADCAST_WEAPON_IMAGES,
} from "../broadcast-constants";
import { broadcastActionSchema } from "../broadcast-schemas";
import { broadcastDesignSearchParams } from "../broadcast-search-params";
import {
	BROADCAST_THEME_DEFAULTS,
	type BroadcastThemeSource,
} from "../broadcast-theme-sources";
import type {
	BroadcastDesignMessage,
	BroadcastScene,
	BroadcastState,
} from "../broadcast-types";
import {
	broadcastDashboardPage,
	broadcastDesignCanvasPage,
	broadcastDesignImageUrl,
} from "../broadcast-urls";
import { BroadcastPreview } from "../components/BroadcastPreview";
import { ScenePicker, useSceneHotkeys } from "../components/ScenePicker";
import * as DesignScenario from "../core/DesignScenario";
import * as ThemeCss from "../core/ThemeCss";
import { loader } from "../loaders/to.$id.broadcast.$channel.design.server";
import styles from "./to.$id.broadcast.$channel.design.module.css";

export { action } from "../actions/to.$id.broadcast.$channel.server";
export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["broadcast"],
};

type Stylesheet = (typeof BROADCAST_THEME_STYLESHEETS)[number];

/** A stylesheet's look or layout, or the custom CSS applied after them. */
type EditorTab = BroadcastThemeSource | "custom";

/** Each stylesheet's look followed by its layout. */
const THEME_SOURCES: BroadcastThemeSource[] =
	BROADCAST_THEME_STYLESHEETS.flatMap((stylesheet) => [
		stylesheet,
		`${stylesheet}.layout` as const,
	]);

interface Draft {
	text: string;
	/** What is saved of it, as of the last time it parsed. */
	edits: string;
	error: ThemeCss.CssError | null;
}

type Drafts = Record<EditorTab, Draft>;

/** The stylesheet the editor opens with on each scene. */
const SCENE_STYLESHEETS: Record<BroadcastScene, Stylesheet> = {
	starting: "HoldScene",
	casters: "CastersScene",
	rosters: "RostersScene",
	maps: "MapsScene",
	game: "GameScene",
	results: "ResultsScene",
	break: "HoldScene",
	replays: "ReplaysScene",
	bracket: "BracketScene",
	team: "TeamScene",
	technical: "HoldScene",
	ending: "HoldScene",
};

/**
 * The overlays' every style laid out for editing, previewed live over a game feed screenshot in a mock scenario
 * driven by the search params (scene, name lengths, bracket type...). Saving keeps only what changed from the
 * default styles, as the broadcast's custom CSS.
 */
export default function BroadcastDesignPage() {
	const { t } = useTranslation(["broadcast", "common"]);
	const tournament = useTournament();
	const data = useLoaderData<typeof loader>();
	const pageArgs = { tournamentId: tournament.ctx.id, slug: data.channel.slug };
	const [{ footage, ...scenario }, setScenario] = useSearchParamsTyped(
		broadcastDesignSearchParams,
	);
	const [drafts, setDrafts] = React.useState(() =>
		initialDrafts(data.settings.css),
	);
	const [tab, setTab] = React.useState<EditorTab>(
		SCENE_STYLESHEETS[scenario.scene],
	);
	const [weaponImages, setWeaponImages] = React.useState(
		data.settings.weaponImages,
	);
	const [takenAt] = React.useState(() => Date.now());
	const [rehearsals, setRehearsals] = React.useState(0);
	const { submit, state: submitState } = useActionSubmit(broadcastActionSchema);

	const css = composeCss(drafts);
	const savedCss = useSavedCss({ saved: data.settings.css, drafts });
	const isDirty =
		css !== savedCss || weaponImages !== data.settings.weaponImages;
	const hasErrors = Object.values(drafts).some((draft) => draft.error);
	const isTooLong = css.length > BROADCAST_CSS_MAX_LENGTH;
	useUnsavedChangesChecker(
		(navigation) =>
			isDirty &&
			(!navigation ||
				navigation.currentLocation.pathname !==
					navigation.nextLocation.pathname),
	);

	const isLogoBroken = useIsBrokenImage(data.tournament.logoUrl);
	const state = DesignScenario.build({
		scenario,
		tournament: isLogoBroken
			? { ...data.tournament, logoUrl: "" }
			: data.tournament,
		settings: { ...data.settings, css, weaponImages },
		takenAt,
	});

	useSceneHotkeys({
		selected: scenario.scene,
		onSelect: (scene) => setScenario({ scene }),
	});

	const save = () => submit("UPDATE_THEME", { weaponImages, css: css || null });

	return (
		<div className={clsx("stack lg", styles.designer)}>
			<header className="stack horizontal sm items-center justify-between flex-wrap">
				<div className="stack horizontal sm items-center">
					<Link
						to={broadcastDashboardPage(pageArgs)}
						className={styles.back}
						aria-label={t("broadcast:design.backToDashboard")}
						title={t("broadcast:design.backToDashboard")}
					>
						<ArrowLeft />
					</Link>
					<h1 className="text-lg">
						{t("broadcast:design.title")} · {data.channel.name}
					</h1>
				</div>
				<div className="stack horizontal sm items-center">
					{isDirty ? (
						<span className="text-xs text-lighter">
							{t("broadcast:design.unsaved")}
						</span>
					) : null}
					<SendouButton
						onClick={save}
						isDisabled={
							!isDirty || hasErrors || isTooLong || submitState !== "idle"
						}
						testId="broadcast-design-save"
					>
						{t("common:actions.save")}
					</SendouButton>
				</div>
			</header>

			<div className={styles.workspace}>
				<section className="stack md">
					<DesignPreview
						src={broadcastDesignCanvasPage(pageArgs)}
						footageUrl={
							BROADCAST_DESIGN_FOOTAGE[footage]
								? broadcastDesignImageUrl(BROADCAST_DESIGN_FOOTAGE[footage])
								: null
						}
						state={state}
						rehearsals={rehearsals}
					/>
					<ScenePicker
						selected={scenario.scene}
						renderTile={(scene, tile) => (
							<SendouButton
								className={tile.className}
								onClick={() => setScenario({ scene })}
								testId={`broadcast-design-scene-${scene}`}
							>
								{tile.children}
							</SendouButton>
						)}
					/>
					<div className={styles.controls}>
						<Choice
							label={t("broadcast:dashboard.transition")}
							value={scenario.transition}
							options={BROADCAST_TRANSITIONS.map((transition) => ({
								value: transition,
								label: t(`broadcast:transition.${transition}`),
							}))}
							onChange={(transition) => setScenario({ transition })}
						/>
						<div className={styles.play}>
							<SendouButton
								variant="outlined"
								icon={<Play />}
								onClick={() => setRehearsals((count) => count + 1)}
							>
								{t("broadcast:design.playTransition")}
							</SendouButton>
						</div>
						<Choice
							label={t("broadcast:design.footage")}
							value={footage}
							options={(
								Object.keys(BROADCAST_DESIGN_FOOTAGE) as Array<
									keyof typeof BROADCAST_DESIGN_FOOTAGE
								>
							).map((key) => ({
								value: key,
								label: t(`broadcast:design.footage.${key}`),
							}))}
							onChange={(key) => setScenario({ footage: key })}
						/>
					</div>
					<ScenarioControls
						scenario={scenario}
						setScenario={setScenario}
						weaponImages={weaponImages}
						setWeaponImages={setWeaponImages}
					/>
				</section>

				<ThemeEditor
					drafts={drafts}
					setDrafts={setDrafts}
					tab={tab}
					setTab={setTab}
					css={css}
					isTooLong={isTooLong}
				/>
			</div>
		</div>
	);
}

/**
 * The saved CSS as the editor composes it, what the drafts are compared to: saved CSS written elsewhere (formatted
 * differently, say) doesn't count as changed by just opening it.
 */
function useSavedCss({ saved, drafts }: { saved: string; drafts: Drafts }) {
	const [baseline, setBaseline] = React.useState(() => ({
		saved,
		composed: composeCss(drafts),
	}));

	if (baseline.saved !== saved) {
		setBaseline({ saved, composed: saved });
	}

	return baseline.saved === saved ? baseline.composed : saved;
}

/** Whether the image fails to load, e.g. a logo whose file is gone, so the mock can stand in for it. */
function useIsBrokenImage(url: string) {
	const [brokenUrl, setBrokenUrl] = React.useState<string | null>(null);

	React.useEffect(() => {
		const image = new Image();
		image.onerror = () => setBrokenUrl(url);
		image.src = url;

		return () => {
			image.onerror = null;
		};
	}, [url]);

	return brokenUrl === url;
}

/** The overlay over the footage screenshot, rendering the state posted to it. */
function DesignPreview({
	src,
	footageUrl,
	state,
	rehearsals,
}: {
	src: string;
	footageUrl: string | null;
	state: BroadcastState;
	rehearsals: number;
}) {
	const { t } = useTranslation(["broadcast"]);
	const iframeRef = React.useRef<HTMLIFrameElement>(null);
	const latest = useLatestRef({ state, rehearsals });

	React.useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const iframeWindow = iframeRef.current?.contentWindow;
			if (
				!iframeWindow ||
				event.source !== iframeWindow ||
				event.origin !== window.location.origin ||
				event.data?.type !== BROADCAST_DESIGN_READY_MESSAGE
			) {
				return;
			}

			postDesign(iframeWindow, latest.current);
		};

		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [latest]);

	React.useEffect(() => {
		const iframeWindow = iframeRef.current?.contentWindow;
		if (iframeWindow) postDesign(iframeWindow, { state, rehearsals });
	}, [state, rehearsals]);

	return (
		<BroadcastPreview
			iframeRef={iframeRef}
			src={src}
			title={t("broadcast:design.title")}
			footageUrl={footageUrl}
		/>
	);
}

function postDesign(
	iframeWindow: Window,
	{ state, rehearsals }: Pick<BroadcastDesignMessage, "state" | "rehearsals">,
) {
	const message: BroadcastDesignMessage = {
		type: BROADCAST_DESIGN_MESSAGE,
		state,
		rehearsals,
	};

	iframeWindow.postMessage(message, window.location.origin);
}

function ScenarioControls({
	scenario,
	setScenario,
	weaponImages,
	setWeaponImages,
}: {
	scenario: DesignScenario.Scenario;
	setScenario: (values: Partial<DesignScenario.Scenario>) => void;
	weaponImages: BroadcastState["settings"]["weaponImages"];
	setWeaponImages: (
		weaponImages: BroadcastState["settings"]["weaponImages"],
	) => void;
}) {
	const { t } = useTranslation(["broadcast", "forms"]);

	return (
		<fieldset className={styles.scenario}>
			<legend className="text-sm font-semi-bold">
				{t("broadcast:design.scenario")}
			</legend>
			<div className={styles.controls}>
				<Choice
					label={t("broadcast:design.names")}
					value={scenario.names}
					options={BROADCAST_DESIGN_NAME_LENGTHS.map((names) => ({
						value: names,
						label: t(`broadcast:design.names.${names}`),
					}))}
					onChange={(names) => setScenario({ names })}
				/>
				<Choice
					label={t("broadcast:design.set")}
					value={scenario.set}
					options={BROADCAST_DESIGN_SET_STAGES.map((set) => ({
						value: set,
						label: t(`broadcast:design.set.${set}`),
					}))}
					onChange={(set) => setScenario({ set })}
				/>
				<Choice
					label={t("broadcast:design.bestOf")}
					value={scenario.bestOf}
					options={BROADCAST_DESIGN_BEST_OF.map((bestOf) => ({
						value: bestOf,
						label: t("broadcast:overlay.bestOf", { count: bestOf }),
					}))}
					onChange={(bestOf) => setScenario({ bestOf })}
				/>
				<Choice
					label={t("broadcast:design.ink")}
					value={scenario.ink ?? "theme"}
					options={[
						{ value: "theme", label: t("broadcast:design.ink.theme") },
						...BROADCAST_INK_COLORS.map((color) => ({
							value: color.key,
							label: t(`broadcast:ink.${color.key}`),
						})),
					]}
					onChange={(ink) => setScenario({ ink: ink === "theme" ? null : ink })}
				/>
				<Choice
					label={t("broadcast:design.players")}
					value={scenario.players}
					options={countOptions({ min: 1, max: BROADCAST_DESIGN_MAX_PLAYERS })}
					onChange={(players) => setScenario({ players })}
				/>
				<Choice
					label={t("broadcast:design.casters")}
					value={scenario.casters}
					options={countOptions({ max: BROADCAST_MAX_CASTERS })}
					onChange={(casters) => setScenario({ casters })}
				/>
				<Choice
					label={t("broadcast:design.otherMatches")}
					value={scenario.otherMatches}
					options={countOptions({ max: BROADCAST_DESIGN_MAX_OTHER_MATCHES })}
					onChange={(otherMatches) => setScenario({ otherMatches })}
				/>
				<Choice
					label={t("broadcast:design.bracket")}
					value={scenario.bracket}
					options={BROADCAST_DESIGN_BRACKETS.map((bracket) => ({
						value: bracket,
						label: t(`broadcast:design.bracket.${bracket}`),
					}))}
					onChange={(bracket) => setScenario({ bracket })}
				/>
				<Choice
					label={t("broadcast:dashboard.bracket.focus")}
					value={scenario.bracketFocus}
					options={BROADCAST_BRACKET_FOCUSES.map((bracketFocus) => ({
						value: bracketFocus,
						label: t(`broadcast:bracketFocus.${bracketFocus}`),
					}))}
					onChange={(bracketFocus) => setScenario({ bracketFocus })}
				/>
				<Choice
					label={t("forms:labels.broadcastWeaponImages")}
					value={weaponImages}
					options={BROADCAST_WEAPON_IMAGES.map((option) => ({
						value: option,
						label: t(`forms:options.broadcastWeaponImages.${option}`),
					}))}
					onChange={setWeaponImages}
				/>
			</div>
			<div className={styles.switches}>
				<SendouSwitch
					isSelected={scenario.swapSides}
					onChange={(swapSides) => setScenario({ swapSides })}
				>
					{t("broadcast:design.swapSides")}
				</SendouSwitch>
				<SendouSwitch
					isSelected={scenario.seeds}
					onChange={(seeds) => setScenario({ seeds })}
				>
					{t("broadcast:design.seeds")}
				</SendouSwitch>
				<SendouSwitch
					isSelected={scenario.logos}
					onChange={(logos) => setScenario({ logos })}
				>
					{t("broadcast:design.logos")}
				</SendouSwitch>
				<SendouSwitch
					isSelected={scenario.placeholderLogos}
					onChange={(placeholderLogos) => setScenario({ placeholderLogos })}
					isDisabled={!scenario.logos}
				>
					{t("broadcast:design.placeholderLogos")}
				</SendouSwitch>
				<SendouSwitch
					isSelected={scenario.headline}
					onChange={(headline) => setScenario({ headline })}
				>
					{t("broadcast:design.headline")}
				</SendouSwitch>
			</div>
		</fieldset>
	);
}

function ThemeEditor({
	drafts,
	setDrafts,
	tab,
	setTab,
	css,
	isTooLong,
}: {
	drafts: Drafts;
	setDrafts: React.Dispatch<React.SetStateAction<Drafts>>;
	tab: EditorTab;
	setTab: (tab: EditorTab) => void;
	css: string;
	isTooLong: boolean;
}) {
	const { t } = useTranslation(["broadcast"]);
	const [showsLayout, setShowsLayout] = React.useState(false);
	const textareaRef = React.useRef<HTMLTextAreaElement>(null);
	const [caret, setCaret] = React.useState(0);
	/** Where to put the selection once the tab it is in shows. */
	const [pendingSelection, setPendingSelection] = React.useState<{
		tab: EditorTab;
		start: number;
		end: number;
	} | null>(null);
	/** Where the last jump to a variable left from. */
	const [jumpedFrom, setJumpedFrom] = React.useState<{
		tab: EditorTab;
		caret: number;
	} | null>(null);
	const draft = drafts[tab];
	const defaultText = tab === "custom" ? null : BROADCAST_THEME_DEFAULTS[tab];
	const isLayout = tab.endsWith(".layout");

	const tabLabel = (option: EditorTab) => {
		const name =
			option === "custom"
				? t("broadcast:design.custom")
				: option.endsWith(".layout")
					? t("broadcast:design.layoutOf", {
							name: option.replace(".layout", ""),
						})
					: option;

		return drafts[option].edits ? t("broadcast:design.edited", { name }) : name;
	};
	const shownTabs = [
		...THEME_SOURCES.filter(
			(source) =>
				!source.endsWith(".layout") ||
				showsLayout ||
				source === tab ||
				drafts[source].edits,
		),
		"custom" as const,
	];

	const edit = (text: string) =>
		setDrafts((current) => ({
			...current,
			[tab]: draftOf(tab, text, current[tab]),
		}));

	React.useEffect(() => {
		const textarea = textareaRef.current;
		if (!pendingSelection || pendingSelection.tab !== tab || !textarea) return;

		selectInTextarea(textarea, pendingSelection);
		setCaret(pendingSelection.start);
		setPendingSelection(null);
	}, [pendingSelection, tab]);

	const select = (selection: {
		tab: EditorTab;
		start: number;
		end: number;
	}) => {
		setPendingSelection(selection);
		if (selection.tab !== tab) setTab(selection.tab);
	};

	const goToDefinition = (definition: VariableDefinition) => {
		setJumpedFrom({ tab, caret });
		select(definition);
	};

	const updateCaret = (event: React.SyntheticEvent<HTMLTextAreaElement>) =>
		setCaret(event.currentTarget.selectionStart);

	const goToClickedVariable = (
		event: React.MouseEvent<HTMLTextAreaElement>,
	) => {
		if (!event.metaKey && !event.ctrlKey) return;

		const clickedAt = event.currentTarget.selectionStart;
		const reference = ThemeCss.variableReferences(draft.text).findLast(
			(candidate) => candidate.start <= clickedAt && clickedAt <= candidate.end,
		);
		const definition = reference
			? definitionOf({ name: reference.name, drafts, tab })
			: null;
		if (definition) goToDefinition(definition);
	};

	/** Replaces the `var()` with the value it reads, undoable as if typed. */
	const inline = (reference: ThemeCss.VariableReference, value: string) => {
		const textarea = textareaRef.current;
		if (!textarea) return;

		selectInTextarea(textarea, reference);
		document.execCommand("insertText", false, value);
		setCaret(textarea.selectionStart);
	};

	return (
		<section className={clsx("stack sm", styles.editor)}>
			<div className="stack horizontal sm items-end justify-between">
				<Choice
					label={t("broadcast:design.stylesheet")}
					value={tab}
					options={shownTabs.map((option) => ({
						value: option,
						label: tabLabel(option),
					}))}
					onChange={setTab}
				/>
				{defaultText !== null ? (
					<SendouButton
						size="small"
						variant="minimal"
						icon={<RotateCcw />}
						isDisabled={draft.text === defaultText}
						onClick={() => edit(defaultText)}
					>
						{t("broadcast:design.revert")}
					</SendouButton>
				) : null}
			</div>
			<SendouSwitch
				size="small"
				isSelected={showsLayout}
				onChange={setShowsLayout}
			>
				{t("broadcast:design.showLayout")}
			</SendouSwitch>
			<p className="text-xs text-lighter">
				{tab === "custom"
					? t("broadcast:design.customHint")
					: isLayout
						? t("broadcast:design.layoutHint")
						: t("broadcast:design.stylesheetHint")}
			</p>
			<textarea
				key={tab}
				ref={textareaRef}
				className={styles.code}
				value={draft.text}
				onChange={(event) => {
					edit(event.currentTarget.value);
					updateCaret(event);
				}}
				onKeyDown={insertTabOnTab}
				onKeyUp={updateCaret}
				onSelect={updateCaret}
				onClick={(event) => {
					updateCaret(event);
					goToClickedVariable(event);
				}}
				spellCheck={false}
				autoCapitalize="off"
				autoComplete="off"
				aria-label={t("broadcast:design.stylesheet")}
				data-testid="broadcast-design-editor"
			/>
			<VariablesOnLine
				drafts={drafts}
				tab={tab}
				caret={caret}
				jumpedFrom={jumpedFrom}
				tabLabel={tabLabel}
				onGoTo={goToDefinition}
				onInline={inline}
				onBack={() => {
					if (!jumpedFrom) return;

					select({
						tab: jumpedFrom.tab,
						start: jumpedFrom.caret,
						end: jumpedFrom.caret,
					});
					setJumpedFrom(null);
				}}
			/>
			{draft.error ? (
				<p className="text-xs text-error" role="alert">
					{t("broadcast:design.syntaxError", {
						line: draft.error.line,
						reason: draft.error.reason,
					})}
				</p>
			) : null}
			<details className={styles.result}>
				<summary className="text-sm font-semi-bold">
					{t("broadcast:design.result", {
						length: css.length,
						max: BROADCAST_CSS_MAX_LENGTH,
					})}
				</summary>
				<pre className={styles.code}>
					{css || t("broadcast:design.noChanges")}
				</pre>
			</details>
			{isTooLong ? (
				<p className="text-xs text-error" role="alert">
					{t("broadcast:design.tooLong", { max: BROADCAST_CSS_MAX_LENGTH })}
				</p>
			) : null}
		</section>
	);
}

interface VariableDefinition {
	tab: EditorTab;
	name: string;
	value: string;
	start: number;
	end: number;
}

/**
 * The variables read on the line the caret is on, each with a shortcut to where it is set and one to replace it
 * with its value. Variables set outside the overlays' styles (sendou.ink's own) are left out.
 */
function VariablesOnLine({
	drafts,
	tab,
	caret,
	jumpedFrom,
	tabLabel,
	onGoTo,
	onInline,
	onBack,
}: {
	drafts: Drafts;
	tab: EditorTab;
	caret: number;
	jumpedFrom: { tab: EditorTab } | null;
	tabLabel: (tab: EditorTab) => string;
	onGoTo: (definition: VariableDefinition) => void;
	onInline: (reference: ThemeCss.VariableReference, value: string) => void;
	onBack: () => void;
}) {
	const { t } = useTranslation(["broadcast"]);
	const text = drafts[tab].text;
	const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
	const lineEnd = text.indexOf("\n", caret);
	const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);

	const variables = ThemeCss.variableReferences(line).flatMap((reference) => {
		const definition = definitionOf({ name: reference.name, drafts, tab });
		if (!definition) return [];

		return [
			{
				reference: {
					...reference,
					start: lineStart + reference.start,
					end: lineStart + reference.end,
				},
				definition,
			},
		];
	});
	const unique = variables.filter(
		(variable, i) =>
			variables.findIndex(
				(other) => other.reference.name === variable.reference.name,
			) === i,
	);

	return (
		<div className={styles.variables}>
			{jumpedFrom ? (
				<SendouButton
					size="small"
					variant="minimal"
					icon={<Undo2 />}
					onClick={onBack}
				>
					{t("broadcast:design.back", { stylesheet: tabLabel(jumpedFrom.tab) })}
				</SendouButton>
			) : null}
			{unique.length > 0 ? (
				unique.map(({ reference, definition }) => (
					<span key={reference.name} className={styles.variable}>
						<SendouButton
							size="small"
							variant="outlined"
							icon={<CornerDownRight />}
							onClick={() => onGoTo(definition)}
							title={t("broadcast:design.goTo", {
								name: reference.name,
								stylesheet: tabLabel(definition.tab),
							})}
						>
							<code>{reference.name}</code>
						</SendouButton>
						<SendouButton
							size="small"
							variant="minimal"
							onClick={() => onInline(reference, definition.value)}
							title={t("broadcast:design.inlineHint", {
								value: definition.value,
							})}
						>
							{t("broadcast:design.inline")}
						</SendouButton>
					</span>
				))
			) : (
				<span className="text-xs text-lighter">
					{t("broadcast:design.variablesHint")}
				</span>
			)}
		</div>
	);
}

/**
 * Where the variable is set: in the open stylesheet if it is set there (as for a scene's own variables), otherwise
 * the first stylesheet setting it (the theme's `--bc-*` ones on the canvas).
 */
function definitionOf({
	name,
	drafts,
	tab,
}: {
	name: string;
	drafts: Drafts;
	tab: EditorTab;
}): VariableDefinition | null {
	for (const candidate of [tab, ...THEME_SOURCES, "custom" as const]) {
		const declaration = ThemeCss.customPropertyDeclarations(
			drafts[candidate].text,
		).find((candidateDeclaration) => candidateDeclaration.name === name);
		if (declaration) return { tab: candidate, ...declaration };
	}

	return null;
}

/** Selects the range and scrolls it to the upper part of the textarea. */
function selectInTextarea(
	textarea: HTMLTextAreaElement,
	{ start, end }: { start: number; end: number },
) {
	textarea.focus({ preventScroll: true });
	textarea.setSelectionRange(start, end);

	const lineIdx = textarea.value.slice(0, start).split("\n").length - 1;
	const lineHeight = Number.parseFloat(getComputedStyle(textarea).lineHeight);
	// after the browser's own scrolling of the selection into view
	requestAnimationFrame(() => {
		textarea.scrollTop = Math.max(
			0,
			lineIdx * lineHeight - textarea.clientHeight / 3,
		);
	});
}

function Choice<Value extends SelectKey>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: Value;
	options: Array<{ value: Value; label: string }>;
	onChange: (value: Value) => void;
}) {
	return (
		<SendouSelect
			label={label}
			items={options.map((option) => ({ id: option.value, ...option }))}
			selectedKey={value}
			onSelectionChange={(key) => {
				const option = options.find((candidate) => candidate.value === key);
				if (option) onChange(option.value);
			}}
		>
			{(item) => (
				<SendouSelectItem key={item.id} id={item.id}>
					{item.label}
				</SendouSelectItem>
			)}
		</SendouSelect>
	);
}

function countOptions({ min = 0, max }: { min?: number; max: number }) {
	return Array.from({ length: max - min + 1 }, (_, i) => ({
		value: min + i,
		label: String(min + i),
	}));
}

/** Tab indents instead of moving focus, `insertText` keeping it undoable. */
function insertTabOnTab(event: React.KeyboardEvent<HTMLTextAreaElement>) {
	if (
		event.key !== "Tab" ||
		event.shiftKey ||
		event.ctrlKey ||
		event.metaKey ||
		event.altKey
	) {
		return;
	}

	event.preventDefault();
	document.execCommand("insertText", false, "\t");
}

function initialDrafts(savedCss: string): Drafts {
	const { stylesheets, custom } = ThemeCss.merge({
		bases: BROADCAST_THEME_DEFAULTS,
		css: savedCss,
	});

	return {
		...(Object.fromEntries(
			THEME_SOURCES.map((source) => [
				source,
				draftOf(source, stylesheets[source]),
			]),
		) as Record<BroadcastThemeSource, Draft>),
		custom: draftOf("custom", custom),
	};
}

/** The draft with its text edited, keeping the edits of the last text that parsed while it doesn't. */
function draftOf(tab: EditorTab, text: string, previous?: Draft): Draft {
	const error = ThemeCss.syntaxError(text);
	if (error) return { text, edits: previous?.edits ?? "", error };

	return {
		text,
		edits:
			tab === "custom"
				? text
				: ThemeCss.diff(BROADCAST_THEME_DEFAULTS[tab], text),
		error: null,
	};
}

function composeCss(drafts: Drafts) {
	return ThemeCss.compose({
		edits: THEME_SOURCES.map((source) => drafts[source].edits),
		custom: drafts.custom.edits,
	});
}

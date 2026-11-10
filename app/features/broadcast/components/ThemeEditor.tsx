import clsx from "clsx";
import { CornerDownRight, RotateCcw, Undo2 } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouSwitch } from "~/components/elements/Switch";
import { BROADCAST_CSS_MAX_LENGTH } from "../broadcast-constants";
import type { BroadcastThemeSource } from "../broadcast-theme-sources";
import * as ThemeCss from "../core/ThemeCss";
import { Choice } from "./Choice";
import styles from "./ThemeEditor.module.css";

/** A scene set's theme as the editor lays it out: its stylesheets in order and their default styles by source (see `themeDefaults`). */
export interface BroadcastTheme {
	stylesheets: readonly string[];
	defaults: Record<BroadcastThemeSource, string>;
}

/** A stylesheet's look or layout, or the custom CSS applied after them. */
export type ThemeEditorTab = BroadcastThemeSource | "custom";
type EditorTab = ThemeEditorTab;

interface Draft {
	text: string;
	/** What is saved of it, as of the last time it parsed. */
	edits: string;
	error: ThemeCss.CssError | null;
}

type Drafts = Record<EditorTab, Draft>;

/**
 * The editor's drafts of the theme starting from the saved CSS, the CSS they compose to and the saved CSS as they
 * compose it, what `css` is compared to for unsaved changes.
 */
export function useThemeDrafts({
	theme,
	saved,
}: {
	theme: BroadcastTheme;
	saved: string;
}) {
	const [drafts, setDrafts] = React.useState(() => initialDrafts(theme, saved));
	const css = composeCss(theme, drafts);
	const savedCss = useSavedCss({ theme, saved, drafts });
	const hasErrors = Object.values(drafts).some((draft) => draft.error);

	return { drafts, setDrafts, css, savedCss, hasErrors };
}

/**
 * Editor of a scene set's theme: each stylesheet's look and layout as the default styles with the edits made to them,
 * and the custom CSS applied after them. Variables read on the caret's line link to where they are set.
 */
export function ThemeEditor({
	theme,
	drafts,
	setDrafts,
	tab,
	setTab,
	css,
	isTooLong,
}: {
	theme: BroadcastTheme;
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
	const defaultText = tab === "custom" ? null : theme.defaults[tab];
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
		...themeSources(theme).filter(
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
			[tab]: draftOf(theme, tab, text, current[tab]),
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
			? definitionOf({ theme, name: reference.name, drafts, tab })
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
				theme={theme}
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
	theme,
	drafts,
	tab,
	caret,
	jumpedFrom,
	tabLabel,
	onGoTo,
	onInline,
	onBack,
}: {
	theme: BroadcastTheme;
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
		const definition = definitionOf({
			theme,
			name: reference.name,
			drafts,
			tab,
		});
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
	theme,
	name,
	drafts,
	tab,
}: {
	theme: BroadcastTheme;
	name: string;
	drafts: Drafts;
	tab: EditorTab;
}): VariableDefinition | null {
	for (const candidate of [tab, ...themeSources(theme), "custom" as const]) {
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

/**
 * The saved CSS as the editor composes it, what the drafts are compared to: saved CSS written elsewhere (formatted
 * differently, say) doesn't count as changed by just opening it.
 */
function useSavedCss({
	theme,
	saved,
	drafts,
}: {
	theme: BroadcastTheme;
	saved: string;
	drafts: Drafts;
}) {
	const [baseline, setBaseline] = React.useState(() => ({
		saved,
		composed: composeCss(theme, drafts),
	}));

	if (baseline.saved !== saved) {
		setBaseline({ saved, composed: saved });
	}

	return baseline.saved === saved ? baseline.composed : saved;
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

function initialDrafts(theme: BroadcastTheme, savedCss: string): Drafts {
	const { stylesheets, custom } = ThemeCss.merge({
		bases: theme.defaults,
		css: savedCss,
	});

	return {
		...Object.fromEntries(
			themeSources(theme).map((source) => [
				source,
				draftOf(theme, source, stylesheets[source]!),
			]),
		),
		custom: draftOf(theme, "custom", custom),
	};
}

/** The draft with its text edited, keeping the edits of the last text that parsed while it doesn't. */
function draftOf(
	theme: BroadcastTheme,
	tab: EditorTab,
	text: string,
	previous?: Draft,
): Draft {
	const error = ThemeCss.syntaxError(text);
	if (error) return { text, edits: previous?.edits ?? "", error };

	return {
		text,
		edits: tab === "custom" ? text : ThemeCss.diff(theme.defaults[tab]!, text),
		error: null,
	};
}

function composeCss(theme: BroadcastTheme, drafts: Drafts) {
	return ThemeCss.compose({
		edits: themeSources(theme).map((source) => drafts[source]!.edits),
		custom: drafts.custom.edits,
	});
}

/** Each stylesheet's look followed by its layout. */
function themeSources(theme: BroadcastTheme): BroadcastThemeSource[] {
	return theme.stylesheets.flatMap((stylesheet) => [
		stylesheet,
		`${stylesheet}.layout` as const,
	]);
}

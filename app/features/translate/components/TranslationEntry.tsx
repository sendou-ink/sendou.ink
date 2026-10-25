import clsx from "clsx";
import * as React from "react";
import { Link } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { toastQueue } from "~/components/elements/Toast";
import { useUnsavedChangesChecker } from "~/form/UnsavedChangesGuard";
import { sourceFileUrl } from "~/utils/urls";
import type { TranslationEntry as Entry } from "../core/TranslationEntries.server";
import * as TranslationSyntax from "../core/TranslationSyntax";
import * as TranslationUnits from "../core/TranslationUnits";
import { updateDrafts, useTranslationDrafts } from "../translate-drafts";
import styles from "./TranslationEntry.module.css";

type Form = Entry["forms"][number];

const PLURAL_EXAMPLE_CANDIDATES = [
	...Array.from({ length: 201 }, (_, i) => i),
	1_000,
	10_000,
	100_000,
	1_000_000,
	// some categories only cover fractions e.g. Polish "other"
	0.5,
	1.5,
];
const PLURAL_EXAMPLES_COUNT = 4;
const PAIRED_TAG_REGEX = /^(<[a-zA-Z0-9]+>)(<\/[a-zA-Z0-9]+>)$/;

export function TranslationEntry({
	entry,
	language,
}: {
	entry: Entry;
	language: string;
}) {
	const drafts = useTranslationDrafts(language);

	const formDrafts = entry.forms.map((form) => {
		const draft = drafts[entry.namespace]?.[form.key];

		return draft &&
			TranslationUnits.isDraftPending({
				form,
				draft,
				currentTranslation: form.translation,
			})
			? draft.value
			: null;
	});
	const hasDraft = formDrafts.some((draft) => draft !== null);
	const isMissing = entry.forms.some((form) => !form.translation);

	return (
		<section
			className={styles.entry}
			data-testid={`translation-entry-${entry.namespace}:${entry.id}`}
		>
			<header className={styles.header}>
				<code className={styles.key}>
					{entry.namespace}:{entry.id}
				</code>
				{hasDraft ? (
					<span className={clsx(styles.badge, styles.badgeDraft)}>Draft</span>
				) : isMissing ? (
					<span className={clsx(styles.badge, styles.badgeMissing)}>
						Missing
					</span>
				) : null}
			</header>
			<Editor entry={entry} language={language} formDrafts={formDrafts} />
			<Usage usage={entry.usage} />
		</section>
	);
}

function Editor({
	entry,
	language,
	formDrafts,
}: {
	entry: Entry;
	language: string;
	formDrafts: Array<string | null>;
}) {
	const textareaRefs = React.useRef<Array<HTMLTextAreaElement | null>>([]);

	const savedValues = entry.forms.map(
		(form, i) => formDrafts[i] ?? form.translation,
	);
	// drafts come from the browser's storage only after hydration, so unsaved edits are kept apart from them
	const [edits, setEdits] = React.useState<Array<string | null>>(() =>
		entry.forms.map(() => null),
	);
	const values = savedValues.map((saved, i) => edits[i] ?? saved);

	const isDirty = values.some((value, i) => value !== savedValues[i]);
	const issues = entry.forms.map((form, i) =>
		values[i] === ""
			? []
			: TranslationSyntax.validate({
					source: form.source,
					translation: values[i],
					isPlural: entry.isPlural,
				}),
	);
	const canSave =
		isDirty && issues.every((formIssues) => formIssues.length === 0);
	const hasDraft = formDrafts.some((draft) => draft !== null);

	useUnsavedChangesChecker(() => isDirty);

	const setValue = (index: number, value: string) =>
		setEdits((current) => current.map((v, i) => (i === index ? value : v)));

	const writeDrafts = (newValues: string[]) => {
		const isSaved = updateDrafts({
			language,
			namespace: entry.namespace,
			drafts: Object.fromEntries(
				entry.forms.map((form, i) => [
					form.key,
					newValues[i].trim() && newValues[i] !== form.translation
						? { value: newValues[i], source: form.source }
						: null,
				]),
			),
		});

		if (!isSaved) {
			toastQueue.add({
				message: "Your browser didn't allow saving the draft",
				variant: "error",
			});
			return;
		}

		setEdits(entry.forms.map(() => null));
	};

	const save = () => {
		if (!canSave) return;
		writeDrafts(values);
	};

	const discard = () =>
		writeDrafts(entry.forms.map((form) => form.translation));

	const insertPlaceholder = (index: number, placeholder: string) => {
		const textarea = textareaRefs.current[index];
		const value = values[index];
		const start = textarea?.selectionStart ?? value.length;
		const end = textarea?.selectionEnd ?? value.length;

		const pairedTag = PAIRED_TAG_REGEX.exec(placeholder);
		const inserted = pairedTag
			? `${pairedTag[1]}${value.slice(start, end)}${pairedTag[2]}`
			: placeholder;
		const caret = start + inserted.length;

		setValue(index, value.slice(0, start) + inserted + value.slice(end));
		requestAnimationFrame(() => {
			textarea?.focus();
			textarea?.setSelectionRange(caret, caret);
		});
	};

	return (
		<div className="stack md">
			{entry.forms.map((form, i) => {
				const id = `translation-${entry.namespace}:${form.key}`;
				const placeholders = TranslationSyntax.placeholders(form.source);

				return (
					<div key={form.key} className="stack sm">
						<FormTexts
							form={form}
							language={language}
							isPlural={entry.isPlural}
							hasDraft={formDrafts[i] !== null}
						/>
						<textarea
							id={id}
							ref={(el) => {
								textareaRefs.current[i] = el;
							}}
							className={styles.textarea}
							value={values[i]}
							onChange={(e) => setValue(i, e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
									e.preventDefault();
									save();
								}
							}}
							aria-label={`${entry.namespace}:${form.key}`}
							aria-invalid={issues[i].length > 0}
							rows={Math.min(
								6,
								Math.max(2, Math.ceil(form.source.length / 60)),
							)}
							lang={language}
							data-testid="translation-textarea"
						/>
						{placeholders.length > 0 ? (
							<div className={styles.placeholders}>
								<span className="text-xs text-lighter">
									Keep as they are, click to insert:
								</span>
								{placeholders.map((placeholder) => (
									<button
										key={placeholder}
										type="button"
										className={styles.placeholderChip}
										onClick={() => insertPlaceholder(i, placeholder)}
									>
										{placeholder}
									</button>
								))}
							</div>
						) : null}
						{issues[i].length > 0 ? (
							<ul className={styles.issues} data-testid="translation-issues">
								{issues[i].map((issue) => (
									<li key={JSON.stringify(issue)}>{issueMessage(issue)}</li>
								))}
							</ul>
						) : null}
					</div>
				);
			})}
			<div className="stack horizontal sm">
				<SendouButton
					size="small"
					onClick={save}
					isDisabled={!canSave}
					testId="save-draft-button"
				>
					Save draft
				</SendouButton>
				{hasDraft ? (
					<SendouButton
						size="small"
						variant="minimal-destructive"
						onClick={discard}
						testId="discard-draft-button"
					>
						Discard draft
					</SendouButton>
				) : null}
			</div>
		</div>
	);
}

function FormTexts({
	form,
	language,
	isPlural,
	hasDraft,
}: {
	form: Form;
	language: string;
	isPlural: boolean;
	hasDraft: boolean;
}) {
	const showCurrentTranslation = form.translation !== "" && hasDraft;

	return (
		<div className={styles.texts}>
			{isPlural && form.pluralCategory ? (
				<div className={styles.pluralCategory}>
					{capitalize(form.pluralCategory)}
					<span className="text-lighter">
						{" "}
						e.g. {pluralExamples(language, form.pluralCategory).join(", ")}
					</span>
				</div>
			) : null}
			<div className={styles.textRow}>
				<span className={styles.textLabel}>English</span>
				<HighlightedText text={form.source} />
			</div>
			{showCurrentTranslation ? (
				<div className={styles.textRow}>
					<span className={styles.textLabel}>Current translation</span>
					<HighlightedText text={form.translation} />
				</div>
			) : null}
		</div>
	);
}

function HighlightedText({ text }: { text: string }) {
	return (
		<span className={styles.text}>
			{TranslationSyntax.segments(text).map((segment, i) =>
				segment.isPlaceholder ? (
					<mark key={i} className={styles.placeholder}>
						{segment.text}
					</mark>
				) : (
					<React.Fragment key={i}>{segment.text}</React.Fragment>
				),
			)}
		</span>
	);
}

function Usage({ usage }: { usage: Entry["usage"] }) {
	if (!usage) return null;

	return (
		<div className={styles.usage}>
			{usage.isSiteWide || usage.routes.length > 0 ? (
				<div className={styles.usageRow}>
					<span className={styles.textLabel}>Used on</span>
					{usage.isSiteWide ? (
						<span className={styles.usageItem}>Shown on every page</span>
					) : null}
					{usage.routes.map((route) =>
						route.includes(":") ? (
							<code key={route} className={styles.usageItem}>
								{route}
							</code>
						) : (
							<Link key={route} to={route} className={styles.usageItem}>
								<code>{route}</code>
							</Link>
						),
					)}
					{usage.hiddenRoutesCount > 0 ? (
						<span className="text-lighter">
							+{usage.hiddenRoutesCount} more
						</span>
					) : null}
				</div>
			) : null}
			<div className={styles.usageRow}>
				<span className={styles.textLabel}>Source</span>
				{usage.files.map((file) => (
					<a
						key={file}
						href={sourceFileUrl(file)}
						target="_blank"
						rel="noreferrer"
						className={styles.usageItem}
					>
						<code>{file.split("/").at(-1)}</code>
					</a>
				))}
				{usage.hiddenFilesCount > 0 ? (
					<span className="text-lighter">+{usage.hiddenFilesCount} more</span>
				) : null}
			</div>
		</div>
	);
}

function pluralExamples(language: string, category: string) {
	const rules = new Intl.PluralRules(language);

	return PLURAL_EXAMPLE_CANDIDATES.filter(
		(n) => rules.select(n) === category,
	).slice(0, PLURAL_EXAMPLES_COUNT);
}

function issueMessage(issue: TranslationSyntax.SyntaxIssue) {
	switch (issue.type) {
		case "EMPTY":
			return "Translation can't be empty";
		case "MISSING_PLACEHOLDER":
			return `${issue.placeholder} is missing`;
		case "UNKNOWN_PLACEHOLDER":
			return `${issue.placeholder} is not in the English text`;
		case "BROKEN_TAGS":
			return "Tags must be closed in the reverse order they were opened";
		case "TAG_MUST_BE_EMPTY":
			return `Leave ${issue.placeholder} empty`;
		case "UNSUPPORTED_MARKUP":
			return "Tags can't have attributes or other HTML syntax";
	}
}

function capitalize(text: string) {
	return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

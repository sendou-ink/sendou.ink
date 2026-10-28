import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { Download, Eye, Upload } from "lucide-react";
import * as React from "react";
import { SendouButton } from "~/components/elements/Button";
import { toastQueue } from "~/components/elements/Toast";
import { languageSearchParams } from "~/modules/i18n/i18n-search-params";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import * as TranslationDrafts from "../core/TranslationDrafts";
import type { TranslatableLanguage } from "../translate-constants";
import {
	addDrafts,
	deleteDrafts,
	useTranslationDrafts,
} from "../translate-drafts";
import { previewLanguagePersisted } from "../translate-persisted";

/** Previewing, downloading and importing the drafts kept in this browser */
export function DraftActions({
	language,
	catalog,
}: {
	language: TranslatableLanguage;
	catalog: TranslationDrafts.Catalog;
}) {
	const drafts = useTranslationDrafts(language);
	const fileInputRef = React.useRef<HTMLInputElement>(null);
	const [isImporting, setIsImporting] = React.useState(false);

	const { pending, obsolete } = TranslationDrafts.sort({ catalog, drafts });
	const hasDrafts = Object.keys(pending).length > 0;

	const startPreview = () => {
		deleteDrafts(language, obsolete);
		PersistedState.write(previewLanguagePersisted, language);
		// full page load so the site loads in the previewed language
		window.location.assign(languageSearchParams.href("/", { lng: language }));
	};

	const download = () => {
		deleteDrafts(language, obsolete);
		const files = Object.entries(
			TranslationDrafts.mergedFiles({ catalog, pending }),
		);

		if (files.length === 1) {
			const [namespace, content] = files[0];
			saveFile(
				new Blob([toJson(content)], { type: "application/json" }),
				`${namespace}.json`,
			);
			return;
		}

		const zip = zipSync(
			Object.fromEntries(
				files.map(([namespace, content]) => [
					`${namespace}.json`,
					strToU8(toJson(content)),
				]),
			),
		);
		saveFile(
			new Blob([new Uint8Array(zip)], { type: "application/zip" }),
			`sendou-ink-translations-${language}.zip`,
		);
	};

	const importFiles = async (fileList: FileList) => {
		setIsImporting(true);
		const files = await readTranslationFiles(fileList).catch(() => null);
		setIsImporting(false);

		if (!files) {
			toastQueue.add({ message: "Couldn't read the files", variant: "error" });
			return;
		}

		const imported = TranslationDrafts.fromFiles({ catalog, files });
		const count = Object.values(imported).reduce(
			(sum, namespaceDrafts) => sum + Object.keys(namespaceDrafts).length,
			0,
		);
		const isSaved = addDrafts(language, imported);

		toastQueue.add(
			!isSaved
				? {
						message: "Your browser didn't allow saving the drafts",
						variant: "error",
					}
				: count > 0
					? {
							message: `Imported ${count} ${count === 1 ? "translation" : "translations"}`,
							variant: "success",
						}
					: {
							message: "No new translations found in the files",
							variant: "info",
						},
		);
	};

	return (
		<div className="stack horizontal sm flex-wrap">
			{hasDrafts ? (
				<>
					<SendouButton
						variant="outlined"
						size="small"
						icon={<Eye />}
						onClick={startPreview}
						testId="translation-preview-button"
					>
						Preview on site
					</SendouButton>
					<SendouButton
						size="small"
						icon={<Download />}
						onClick={download}
						testId="translation-download-button"
					>
						Download files
					</SendouButton>
				</>
			) : null}
			<SendouButton
				variant="minimal"
				size="small"
				icon={<Upload />}
				onClick={() => fileInputRef.current?.click()}
				isPending={isImporting}
				testId="translation-import-button"
			>
				Import files
			</SendouButton>
			<input
				ref={fileInputRef}
				type="file"
				accept=".json,.zip,application/json,application/zip"
				multiple
				hidden
				onChange={(e) => {
					const fileList = e.target.files;
					if (fileList && fileList.length > 0) void importFiles(fileList);
					e.target.value = "";
				}}
				data-testid="translation-import-input"
			/>
		</div>
	);
}

/** Namespace -> parsed json of the uploaded `<namespace>.json` files, also from inside zips */
async function readTranslationFiles(fileList: FileList) {
	const result: Record<string, Record<string, unknown>> = {};

	for (const file of fileList) {
		const contents: Array<[name: string, text: string]> = file.name.endsWith(
			".zip",
		)
			? Object.entries(unzipSync(new Uint8Array(await file.arrayBuffer()))).map(
					([name, data]) => [name, strFromU8(data)],
				)
			: [[file.name, await file.text()]];

		for (const [name, text] of contents) {
			if (!name.endsWith(".json")) continue;

			// "common (1).json" when the browser renamed a repeated download
			const namespace = (name.split("/").at(-1) ?? name)
				.replace(/\.json$/, "")
				.replace(/\s*\(\d+\)$/, "");

			try {
				const parsed: unknown = JSON.parse(text);
				if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
					result[namespace] = Object.fromEntries(Object.entries(parsed));
				}
			} catch {
				// not a translation file
			}
		}
	}

	return result;
}

function toJson(content: Record<string, string>) {
	return `${JSON.stringify(content, null, "\t")}\n`;
}

function saveFile(blob: Blob, fileName: string) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.click();
	URL.revokeObjectURL(url);
}

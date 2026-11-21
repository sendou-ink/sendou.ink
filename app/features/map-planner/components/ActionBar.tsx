import clsx from "clsx";
import {
	Download,
	FileDown,
	FolderOpen,
	ImageDown,
	Link2,
	LogOut,
	Maximize,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouMenu, SendouMenuItem } from "~/components/elements/Menu";
import { toastQueue } from "~/components/elements/Toast";
import { downloadBlob } from "~/utils/download";
import { logger } from "~/utils/logger";
import * as PlanCommands from "../core/PlanCommands";
import type { PlanDocument } from "../core/PlanDocument";
import type { PlanEditor } from "../core/PlanEditor";
import * as PlanEncoding from "../core/PlanEncoding";
import { planLinkPath } from "../plans-urls";
import { planFileName } from "../plans-utils";
import styles from "./ActionBar.module.css";
import { StagePicker } from "./StagePicker";

/** Far above any plan the format allows, so a wrong pick of a huge file isn't read whole. */
const MAX_PLAN_FILE_BYTES = 10_000_000;
const TOAST_TIMEOUT_MS = 5000;

/** Why a plan file couldn't be opened, as the translation key telling the user. */
const PLAN_OPEN_ERROR_KEYS = {
	invalid: "common:plans.file.notAPlan",
	tldraw: "common:plans.file.tldraw",
	unsupportedVersion: "common:plans.newerVersion",
} as const;

/** Map choice, view controls, sharing and files, on the right of the map. */
export function ActionBar({
	editor,
	document,
	isMapShown,
	onMapPicked,
	onPlanOpened,
	onFitView,
	exportImage,
	className,
}: {
	editor: PlanEditor;
	document: PlanDocument;
	/** `false` while no map has been picked yet: the map is blank and the stage picker starts open. */
	isMapShown: boolean;
	onMapPicked: () => void;
	/** A plan file replaced the plan. */
	onPlanOpened: () => void;
	onFitView: () => void;
	exportImage: () => Promise<Blob>;
	className?: string;
}) {
	const { t } = useTranslation(["common"]);

	const copyLink = () => {
		const path = planLinkPath(editor.getDocument());
		if (!path) {
			toastQueue.add({
				message: t("common:plans.link.tooBig"),
				variant: "error",
			});
			return;
		}

		navigator.clipboard
			.writeText(new URL(path, window.location.origin).href)
			.then(
				() =>
					toastQueue.add(
						{ message: t("common:plans.link.copied"), variant: "success" },
						{ timeout: TOAST_TIMEOUT_MS },
					),
				() => {},
			);
	};

	return (
		<div className={clsx(styles.actionBar, className)}>
			<StagePicker
				editor={editor}
				document={document}
				isMapShown={isMapShown}
				onMapPicked={onMapPicked}
			/>
			<SendouButton
				variant="minimal"
				shape="square"
				icon={<Maximize />}
				aria-label={t("common:plans.fitView")}
				title={t("common:plans.fitView")}
				onClick={onFitView}
				testId="plan-fit-view-button"
			/>
			<SendouButton
				variant="minimal"
				shape="square"
				icon={<Link2 />}
				aria-label={t("common:plans.link.copy")}
				title={t("common:plans.link.copy")}
				onClick={copyLink}
				isDisabled={!isMapShown}
				testId="plan-copy-link-button"
			/>
			<PlanFileMenu
				editor={editor}
				isMapShown={isMapShown}
				onPlanOpened={onPlanOpened}
				exportImage={exportImage}
			/>
			<LinkButton
				to="/"
				variant="minimal"
				shape="square"
				icon={<LogOut />}
				aria-label={t("common:plans.leave")}
			/>
		</div>
	);
}

function PlanFileMenu({
	editor,
	isMapShown,
	onPlanOpened,
	exportImage,
}: {
	editor: PlanEditor;
	isMapShown: boolean;
	onPlanOpened: () => void;
	exportImage: () => Promise<Blob>;
}) {
	const { t } = useTranslation(["common"]);
	const fileInputRef = React.useRef<HTMLInputElement>(null);

	const downloadImage = async () => {
		try {
			downloadBlob(
				`${planFileName(editor.getDocument(), new Date())}.png`,
				await exportImage(),
			);
		} catch (error) {
			logger.error("Failed to export plan as image", error);
			toastQueue.add({
				message: t("common:plans.file.imageError"),
				variant: "error",
			});
		}
	};

	const downloadFile = () =>
		downloadBlob(
			`${planFileName(editor.getDocument(), new Date())}.json`,
			new Blob([PlanEncoding.encode(editor.getDocument())], {
				type: "application/json",
			}),
		);

	const openFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		// cleared so picking the same file again still fires a change
		event.target.value = "";
		if (!file) return;

		const result: PlanEncoding.DecodeResult =
			file.size > MAX_PLAN_FILE_BYTES
				? { ok: false, error: "invalid" }
				: PlanEncoding.decode(await file.text());
		if (!result.ok) {
			toastQueue.add({
				message: t(PLAN_OPEN_ERROR_KEYS[result.error]),
				variant: "error",
			});
			return;
		}

		editor.apply(
			PlanCommands.replacePlan(editor.getDocument(), result.document),
		);
		onPlanOpened();
	};

	return (
		<>
			<SendouMenu
				placement="bottom end"
				trigger={
					<SendouButton
						icon={<Download />}
						variant="minimal"
						shape="square"
						aria-label={t("common:plans.file.menu")}
						title={t("common:plans.file.menu")}
						testId="plan-file-menu-button"
					/>
				}
			>
				<SendouMenuItem
					icon={<ImageDown />}
					onAction={downloadImage}
					isDisabled={!isMapShown}
					data-testid="plan-download-image"
				>
					{t("common:plans.file.downloadImage")}
				</SendouMenuItem>
				<SendouMenuItem
					icon={<FileDown />}
					onAction={downloadFile}
					isDisabled={!isMapShown}
					data-testid="plan-download-file"
				>
					{t("common:plans.file.downloadFile")}
				</SendouMenuItem>
				<SendouMenuItem
					icon={<FolderOpen />}
					onAction={() => fileInputRef.current?.click()}
					data-testid="plan-open-file"
				>
					{t("common:plans.file.open")}
				</SendouMenuItem>
			</SendouMenu>
			<input
				ref={fileInputRef}
				type="file"
				accept=".json,.tldr"
				onChange={openFile}
				hidden
				data-testid="plan-file-input"
			/>
		</>
	);
}

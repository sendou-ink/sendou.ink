import { Check, Copy, HardDriveDownload, Share2 } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useMatches } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { SendouDialog } from "~/components/elements/Dialog";
import { SendouSwitch } from "~/components/elements/Switch";
import { useTheme } from "~/features/theme/core/provider";
import { useCopyPngToClipboard } from "~/hooks/useCopyToClipboard";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import { SENDOU_INK_BASE_URL } from "~/utils/urls";
import { GraphicQrCodeContext } from "./Graphic";
import styles from "./ImageExportDialog.module.css";

const EXPORT_SCALE = 1.75;

const COARSE_POINTER_QUERY = "(pointer: coarse)";

type ThemeSelection = "light" | "dark" | "light-custom" | "dark-custom";

const THEME_SELECTIONS = [
	{
		value: "light",
		translationKey: "common:imageExport.theme.light",
		needsCustomTheme: false,
	},
	{
		value: "dark",
		translationKey: "common:imageExport.theme.dark",
		needsCustomTheme: false,
	},
	{
		value: "light-custom",
		translationKey: "common:imageExport.theme.lightCustom",
		needsCustomTheme: true,
	},
	{
		value: "dark-custom",
		translationKey: "common:imageExport.theme.darkCustom",
		needsCustomTheme: true,
	},
] as const;

interface ImageExportDialogProps {
	/** Opens the dialog; its own `onPress` also runs (useful for lazy loading the graphic's data) */
	trigger: React.ReactNode;
	heading: string;
	/** Name of the downloaded file without the extension */
	filename: string;
	/** Path the QR code links to, defaults to the current page */
	qrCodePath?: string;
	settings?: React.ReactNode;
	children: React.ReactNode;
}

/**
 * Previews a graphic with generic settings (color scheme, custom theme, QR code) and downloads a
 * snapdom screenshot of it as .png. Graphics render their QR code via {@link GraphicQrCodeContext}.
 */
export function ImageExportDialog({
	trigger,
	heading,
	...contentProps
}: ImageExportDialogProps) {
	return (
		<SendouDialog
			trigger={trigger}
			heading={heading}
			showCloseButton
			className={styles.dialog}
		>
			<ImageExportDialogContent {...contentProps} />
		</SendouDialog>
	);
}

function ImageExportDialogContent({
	filename,
	qrCodePath,
	settings,
	children,
}: Omit<ImageExportDialogProps, "trigger" | "heading">) {
	const { t } = useTranslation(["common"]);
	const { htmlThemeClass } = useTheme();
	const location = useLocation();
	const pageHasCustomTheme = usePageHasCustomTheme();
	const isMobile = useIsMobile();
	const [themeSelection, setThemeSelection] = React.useState<ThemeSelection>(
		() => {
			const mode = htmlThemeClass === "light" ? "light" : "dark";

			return pageHasCustomTheme ? `${mode}-custom` : mode;
		},
	);
	const [withQrCode, setWithQrCode] = React.useState(true);
	const [exportAction, setExportAction] = React.useState<
		"download" | "copy" | null
	>(null);
	const { copyPngToClipboard, copySuccess } = useCopyPngToClipboard();
	const frameRef = React.useRef<HTMLDivElement>(null);

	const theme = themeSelection.startsWith("light") ? "light" : "dark";
	const useCustomTheme = themeSelection.endsWith("-custom");

	const qrCodeUrl = `${SENDOU_INK_BASE_URL}${qrCodePath ?? `${location.pathname}${location.search}`}`;

	// snapdom re-downloads every image at export and silently drops failures, so they are warmed
	// while the preview idles. Runs after every render since settings can mount new images
	// (e.g. ability chunks); re-running once cached is ~7ms.
	React.useEffect(() => {
		if (exportAction) return;

		let cancelled = false;

		import("@zumer/snapdom").then(({ preCache }) => {
			if (cancelled || !frameRef.current) return;

			preCache(frameRef.current).catch(() => {});
		});

		return () => {
			cancelled = true;
		};
	});

	const handleDownload = async () => {
		if (!frameRef.current) return;

		setExportAction("download");
		try {
			const blob = await capturePng(frameRef.current);

			await saveImage(blob, `${filename}.png`, { canShare: isMobile });
		} finally {
			setExportAction(null);
		}
	};

	const handleCopy = async () => {
		if (!frameRef.current) return;

		setExportAction("copy");
		try {
			await copyPngToClipboard(capturePng(frameRef.current));
		} finally {
			setExportAction(null);
		}
	};

	return (
		<div className="stack md">
			<div className={styles.settings}>
				<SendouChipRadioGroup wrap>
					{THEME_SELECTIONS.filter(
						(selection) => pageHasCustomTheme || !selection.needsCustomTheme,
					).map((selection) => (
						<SendouChipRadio
							key={selection.value}
							name="image-export-theme"
							value={selection.value}
							checked={themeSelection === selection.value}
							onChange={() => setThemeSelection(selection.value)}
						>
							{t(selection.translationKey)}
						</SendouChipRadio>
					))}
				</SendouChipRadioGroup>
				<SendouSwitch isSelected={withQrCode} onChange={setWithQrCode}>
					{t("common:imageExport.qrCode")}
				</SendouSwitch>
				{settings}
			</div>
			<div className={styles.actions}>
				<SendouButton
					icon={isMobile ? <Share2 /> : <HardDriveDownload />}
					onPress={handleDownload}
					isDisabled={exportAction !== null}
				>
					{exportAction === "download"
						? t("common:actions.loading")
						: isMobile
							? t("common:actions.share")
							: t("common:imageExport.download")}
				</SendouButton>
				{!isMobile && canCopyPngToClipboard() ? (
					<SendouButton
						variant={copySuccess ? "outlined-success" : "outlined"}
						icon={copySuccess ? <Check /> : <Copy />}
						onPress={handleCopy}
						isDisabled={exportAction !== null}
					>
						{t("common:actions.copyToClipboard")}
					</SendouButton>
				) : null}
			</div>
			<div className={styles.scroller}>
				<div
					ref={frameRef}
					className={styles.frame}
					data-theme={theme}
					data-default-theme={
						pageHasCustomTheme && !useCustomTheme ? true : undefined
					}
					data-testid="image-export-frame"
				>
					<GraphicQrCodeContext.Provider value={withQrCode ? qrCodeUrl : null}>
						{children}
					</GraphicQrCodeContext.Provider>
				</div>
			</div>
		</div>
	);
}

async function capturePng(frame: HTMLDivElement) {
	const { snapdom } = await import("@zumer/snapdom");

	// defensive/speculative fix
	await document.fonts.ready;

	return snapdom.toBlob(frame, {
		type: "png",
		quality: 1,
		scale: EXPORT_SCALE,
		// snapdom's own download helper forces this, without it the export size would vary by device
		dpr: 1,
		embedFonts: true,
		// without this snapdom re-encodes images down to their rendered size, making e.g. the tier image look rough
		compress: false,
		// names ending in a glyph outside the graphic's font (emoji, Greek, ...) get measured with
		// one fallback font in the page and another when rasterized, so a box frozen to its exact
		// text width ends up an ellipsis short. This re-measures the clone and pins diverging boxes
		reconcile: true,
	});
}

function canCopyPngToClipboard() {
	return typeof ClipboardItem !== "undefined";
}

/** Share sheet when allowed (mobile) and supported, otherwise a download. */
async function saveImage(
	blob: Blob,
	filename: string,
	{ canShare }: { canShare: boolean },
) {
	const file = new File([blob], filename, { type: blob.type });

	if (canShare && navigator.canShare?.({ files: [file] })) {
		try {
			await navigator.share({ files: [file], title: filename });
			return;
		} catch (e) {
			if (e instanceof Error && e.name === "AbortError") return;
		}
	}

	// a blob url is used over a data url because iOS Safari fails to save big data urls
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}

function useIsMobile() {
	return useMediaQuery(COARSE_POINTER_QUERY);
}

function usePageHasCustomTheme() {
	const matches = useMatches();

	return matches.some((match) =>
		Boolean(
			(match.loaderData as { customTheme?: unknown } | undefined)?.customTheme,
		),
	);
}

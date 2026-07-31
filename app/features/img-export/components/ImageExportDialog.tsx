import { HardDriveDownload } from "lucide-react";
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
import { SENDOU_INK_BASE_URL } from "~/utils/urls";
import { GraphicQrCodeContext } from "./Graphic";
import styles from "./ImageExportDialog.module.css";

const EXPORT_SCALE = 1.75;

interface ImageExportDialogProps {
	/** Button that opens the dialog, e.g. a `SendouButton` (its own `onPress` also runs, useful for lazy loading the graphic's data) */
	trigger: React.ReactNode;
	heading: string;
	/** Name of the downloaded file without the extension */
	filename: string;
	/** Path the QR code links to, defaults to the current page */
	qrCodePath?: string;
	/** Extra settings controls specific to the use case */
	settings?: React.ReactNode;
	/** The graphic to preview and export */
	children: React.ReactNode;
}

/**
 * Dialog for exporting a graphic component as a .png image. Renders the given graphic
 * as a preview with generic settings (color scheme, custom theme, QR code) and downloads
 * a screenshot of it via snapdom. Graphics render their QR code via {@link GraphicQrCodeContext}.
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
	const [theme, setTheme] = React.useState<"light" | "dark">(
		htmlThemeClass === "light" ? "light" : "dark",
	);
	const [useCustomTheme, setUseCustomTheme] = React.useState(true);
	const [withQrCode, setWithQrCode] = React.useState(true);
	const frameRef = React.useRef<HTMLDivElement>(null);

	const qrCodeUrl = `${SENDOU_INK_BASE_URL}${qrCodePath ?? `${location.pathname}${location.search}`}`;

	const handleDownload = async () => {
		if (!frameRef.current) return;

		const { snapdom } = await import("@zumer/snapdom");

		await snapdom.download(frameRef.current, {
			type: "png",
			filename,
			quality: 1,
			scale: EXPORT_SCALE,
			embedFonts: true,
			// without this snapdom re-encodes images down to their rendered size, making e.g. the tier image look rough
			compress: false,
		});
	};

	return (
		<div className="stack md">
			<div className={styles.settings}>
				<SendouChipRadioGroup>
					<SendouChipRadio
						name="image-export-theme"
						value="light"
						checked={theme === "light"}
						onChange={() => setTheme("light")}
					>
						{t("common:imageExport.theme.light")}
					</SendouChipRadio>
					<SendouChipRadio
						name="image-export-theme"
						value="dark"
						checked={theme === "dark"}
						onChange={() => setTheme("dark")}
					>
						{t("common:imageExport.theme.dark")}
					</SendouChipRadio>
				</SendouChipRadioGroup>
				{pageHasCustomTheme ? (
					<SendouSwitch
						isSelected={useCustomTheme}
						onChange={setUseCustomTheme}
					>
						{t("common:imageExport.useTheme")}
					</SendouSwitch>
				) : null}
				<SendouSwitch isSelected={withQrCode} onChange={setWithQrCode}>
					{t("common:imageExport.qrCode")}
				</SendouSwitch>
				{settings}
			</div>
			<SendouButton
				icon={<HardDriveDownload />}
				onPress={handleDownload}
				className="mx-auto"
			>
				{t("common:imageExport.download")}
			</SendouButton>
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

function usePageHasCustomTheme() {
	const matches = useMatches();

	return matches.some((match) =>
		Boolean(
			(match.loaderData as { customTheme?: unknown } | undefined)?.customTheme,
		),
	);
}

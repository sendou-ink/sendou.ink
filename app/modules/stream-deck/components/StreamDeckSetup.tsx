import { CircleCheck, Unplug, Usb } from "lucide-react";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { useStreamDeck } from "../hooks";
import * as StreamDeck from "../stream-deck";
import styles from "./StreamDeckSetup.module.css";

/**
 * Connecting a Stream Deck: `children` tells what it does on this page, then which browsers and decks work, the
 * connect button or the deck connected, and `faces` laid out as on the deck, so the keys can be learned before
 * plugging one in.
 */
export function StreamDeckSetup({
	faces,
	children,
}: {
	faces: StreamDeck.KeyFace[];
	children: React.ReactNode;
}) {
	const { t } = useTranslation(["common"]);
	const streamDeck = useStreamDeck();

	return (
		<div className="stack md">
			<p className="text-sm text-lighter">
				{children} {t("common:streamDeck.elgatoApp")}
			</p>
			<p className="text-xs text-lighter">{t("common:streamDeck.support")}</p>
			{streamDeck.isAvailable === false ? (
				<p className="text-sm text-warning">
					{t("common:streamDeck.noWebHid")}
				</p>
			) : streamDeck.connection ? (
				<div className="stack horizontal sm items-center flex-wrap">
					<span className={styles.connected}>
						<CircleCheck size={18} />
						{t("common:streamDeck.connected", {
							name: streamDeck.connection.name,
						})}
					</span>
					<SendouButton
						size="small"
						variant="minimal-destructive"
						icon={<Unplug />}
						onClick={() => void streamDeck.disconnect()}
						testId="stream-deck-disconnect"
					>
						{t("common:streamDeck.disconnect")}
					</SendouButton>
				</div>
			) : (
				<SendouButton
					size="small"
					variant="outlined"
					icon={<Usb />}
					onClick={() => void streamDeck.connect()}
					isDisabled={streamDeck.isAvailable === null}
					className="self-start"
					testId="stream-deck-connect"
				>
					{t("common:streamDeck.connect")}
				</SendouButton>
			)}
			{streamDeck.problem ? (
				<p className="text-sm text-warning">
					{streamDeck.problem.type === "unsupportedModel"
						? t("common:streamDeck.unsupportedModel", {
								name: streamDeck.problem.name,
							})
						: streamDeck.problem.type === "drawFailed"
							? t("common:streamDeck.drawFailed", {
									message: streamDeck.problem.message,
								})
							: t("common:streamDeck.openFailed")}
				</p>
			) : null}
			<KeysPreview faces={faces} />
		</div>
	);
}

function KeysPreview({ faces }: { faces: StreamDeck.KeyFace[] }) {
	const { t } = useTranslation(["common"]);

	return (
		<ol
			className={styles.keys}
			style={{ "--columns": StreamDeck.COLUMNS } as React.CSSProperties}
			aria-label={t("common:streamDeck.keys")}
			data-testid="stream-deck-keys"
		>
			{faces.map((face, idx) => (
				<li
					key={idx}
					className={styles.key}
					style={
						{
							"--key-background": StreamDeck.keyBackground(face),
						} as React.CSSProperties
					}
					data-selected={face.isSelected || undefined}
					data-disabled={face.isDisabled || undefined}
				>
					<face.icon size={20} />
					<span className={styles.keyLabel}>{face.label}</span>
					{face.detail ? (
						<span className={styles.keyDetail}>{face.detail}</span>
					) : null}
				</li>
			))}
		</ol>
	);
}

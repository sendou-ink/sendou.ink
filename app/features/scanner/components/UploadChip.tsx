/**
 * A match's upload state, one word and an icon at the card's right:
 * `uploaded ✓` · `uploading…` · `waiting for result` · `failed [Retry]` ·
 * `not uploaded [Upload]` · `skipped: …`.
 */
import clsx from "clsx";
import {
	Check,
	CloudOff,
	CloudUpload,
	Hourglass,
	TriangleAlert,
} from "lucide-react";
import type { IngestedMatchLink } from "~/features/scanner-ingest/scanner-ingest-schemas";
import { sendouQMatchPage, tournamentMatchPage } from "~/utils/urls";
import { lobbyLabel } from "../core/labels";
import type { IngestSkipReason } from "../core/match-builder";
import type { ScannerLobby } from "../scanner-types";
import type { SendStatus } from "../store/events";
import styles from "./UploadChip.module.css";

export type UploadState =
	| { kind: "uploaded"; link?: IngestedMatchLink }
	| { kind: "uploading" }
	| { kind: "queued" }
	| { kind: "waiting"; onRetry?: () => void }
	| { kind: "failed"; error?: string; onRetry?: () => void }
	| { kind: "not-uploaded"; onUpload?: () => void }
	| { kind: "skipped"; reason: IngestSkipReason; lobby: ScannerLobby | null };

/** Folds a match's aggregated send status, skip reason and the upload toggle into what the chip shows. */
export function uploadStateOf({
	send,
	skipReason,
	lobby,
	canUpload,
	onUpload,
}: {
	send: SendStatus | undefined;
	skipReason: IngestSkipReason | undefined;
	lobby: ScannerLobby | null;
	/** logged in: Retry/Upload buttons show */
	canUpload: boolean;
	onUpload: () => void;
}): UploadState {
	if (skipReason) return { kind: "skipped", reason: skipReason, lobby };
	const action = canUpload ? onUpload : undefined;
	switch (send?.state) {
		case "sent":
			return { kind: "uploaded", link: send.link };
		case "sending":
			return { kind: "uploading" };
		case "queued":
			return { kind: "queued" };
		case "unlinked":
			return { kind: "waiting", onRetry: action };
		case "failed":
			return { kind: "failed", error: send.error, onRetry: action };
		default:
			return { kind: "not-uploaded", onUpload: action };
	}
}

export function UploadChip({ state }: { state: UploadState }) {
	switch (state.kind) {
		case "uploaded":
			return (
				<span className={clsx(styles.chip, styles.uploaded)}>
					<Check size={12} aria-hidden />
					{state.link ? (
						<a
							href={linkUrl(state.link)}
							target="_blank"
							rel="noreferrer"
							className={styles.link}
						>
							uploaded
						</a>
					) : (
						"uploaded"
					)}
				</span>
			);
		case "uploading":
			return (
				<span className={clsx(styles.chip, styles.busy)}>
					<span className={styles.dot} />
					uploading…
				</span>
			);
		case "queued":
			return (
				<span className={clsx(styles.chip, styles.busy)}>
					<span className={styles.dot} />
					queued
				</span>
			);
		case "waiting":
			return (
				<span className={clsx(styles.chip, styles.waiting)}>
					<Hourglass size={12} aria-hidden />
					waiting for result
					{state.onRetry ? (
						<button
							type="button"
							className={styles.action}
							onClick={state.onRetry}
						>
							Retry
						</button>
					) : null}
				</span>
			);
		case "failed":
			return (
				<span className={clsx(styles.chip, styles.failed)} title={state.error}>
					<TriangleAlert size={12} aria-hidden />
					failed
					{state.onRetry ? (
						<button
							type="button"
							className={styles.action}
							onClick={state.onRetry}
						>
							Retry
						</button>
					) : null}
				</span>
			);
		case "not-uploaded":
			return (
				<span className={styles.chip}>
					<CloudOff size={12} aria-hidden />
					not uploaded
					{state.onUpload ? (
						<button
							type="button"
							className={styles.action}
							onClick={state.onUpload}
						>
							<CloudUpload size={12} aria-hidden />
							Upload
						</button>
					) : null}
				</span>
			);
		case "skipped":
			return (
				<span className={styles.chip}>
					skipped:{" "}
					{state.reason === "disconnect"
						? "disconnect"
						: (lobbyLabel(state.lobby) ?? "not a private battle")}
				</span>
			);
	}
}

function linkUrl(link: IngestedMatchLink): string {
	return link.type === "tournament"
		? tournamentMatchPage({
				tournamentId: link.tournamentId,
				matchId: link.matchId,
			})
		: sendouQMatchPage(link.groupMatchId);
}

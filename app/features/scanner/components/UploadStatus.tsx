/**
 * A finished match's upload state as one icon button beside the card's
 * expand arrow: ✓ uploaded · ☁↑ uploading · ⌛ waiting for result · ⚠ failed
 * · ☁⃠ not uploaded (or skipped). Clicking it opens what happened in words,
 * the match link once there is one, and Retry / Upload where they apply.
 */
import clsx from "clsx";
import {
	Check,
	CloudOff,
	CloudUpload,
	ExternalLink,
	Hourglass,
	TriangleAlert,
} from "lucide-react";
import type { JSX } from "react";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import type { IngestedMatchLink } from "~/features/scanner-ingest/scanner-ingest-schemas";
import { sendouQMatchPage, tournamentMatchPage } from "~/utils/urls";
import { lobbyLabel } from "../core/labels";
import type { IngestSkipReason } from "../core/match-builder";
import type { ScannerLobby } from "../scanner-types";
import type { SendStatus } from "../store/events";
import styles from "./UploadStatus.module.css";

export type UploadState =
	| { kind: "uploaded"; link?: IngestedMatchLink }
	| { kind: "uploading" }
	| { kind: "waiting"; onRetry?: () => void }
	| { kind: "failed"; error?: string; onRetry?: () => void }
	| { kind: "not-uploaded"; onUpload?: () => void }
	| { kind: "skipped"; reason: IngestSkipReason; lobby: ScannerLobby | null };

interface UploadView {
	icon: JSX.Element;
	tone: "success" | "info" | "warning" | "error" | "muted";
	title: string;
	detail?: string;
	error?: string;
	link?: IngestedMatchLink;
	action?: { label: string; run: () => void };
}

/** Folds a match's aggregated send status, skip reason and the upload toggle into what the button shows. */
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
		case "unlinked":
			return { kind: "waiting", onRetry: action };
		case "failed":
			return { kind: "failed", error: send.error, onRetry: action };
		default:
			return { kind: "not-uploaded", onUpload: action };
	}
}

export function UploadStatusButton({
	state,
	className,
}: {
	state: UploadState;
	/** the card's circle button look, shared with the expand arrow */
	className?: string;
}) {
	const view = viewOf(state);
	return (
		<SendouPopover
			trigger={
				<SendouButton
					variant="minimal"
					size="small"
					shape="circle"
					icon={view.icon}
					className={clsx(className, styles.trigger)}
					data-tone={view.tone}
					aria-label={view.title}
				/>
			}
			popoverClassName={styles.popover}
			placement="bottom end"
		>
			<div className={styles.body}>
				<div className={styles.title}>
					{view.icon}
					{view.title}
				</div>
				{view.detail ? <p className={styles.detail}>{view.detail}</p> : null}
				{view.error ? <p className={styles.error}>{view.error}</p> : null}
				{view.link ? (
					<a
						href={linkUrl(view.link)}
						target="_blank"
						rel="noreferrer"
						className={styles.link}
					>
						Open match
						<ExternalLink size={12} aria-hidden />
					</a>
				) : null}
				{view.action ? (
					<SendouButton
						variant="outlined"
						size="miniscule"
						className={styles.action}
						onClick={view.action.run}
					>
						{view.action.label}
					</SendouButton>
				) : null}
			</div>
		</SendouPopover>
	);
}

function viewOf(state: UploadState): UploadView {
	switch (state.kind) {
		case "uploaded":
			return {
				icon: <Check aria-hidden />,
				tone: "success",
				title: "Uploaded to sendou.ink",
				link: state.link,
			};
		case "uploading":
			return {
				icon: <CloudUpload aria-hidden className={styles.busy} />,
				tone: "info",
				title: "Uploading to sendou.ink…",
			};
		case "waiting":
			return {
				icon: <Hourglass aria-hidden />,
				tone: "warning",
				title: "Waiting for the result",
				detail:
					"sendou.ink has the game but the match isn't reported yet. It's retried on its own once the match is reported.",
				action: retryAction(state.onRetry),
			};
		case "failed":
			return {
				icon: <TriangleAlert aria-hidden />,
				tone: "error",
				title: "Upload failed",
				error: state.error,
				action: retryAction(state.onRetry),
			};
		case "not-uploaded":
			return {
				icon: <CloudOff aria-hidden />,
				tone: "muted",
				title: "Not uploaded",
				detail: state.onUpload
					? "This game hasn't been sent to sendou.ink."
					: "Log in to upload results to sendou.ink.",
				action: state.onUpload
					? { label: "Upload", run: state.onUpload }
					: undefined,
			};
		case "skipped":
			return {
				icon: <CloudOff aria-hidden />,
				tone: "muted",
				title: "Not uploaded",
				detail:
					state.reason === "disconnect"
						? "A disconnect ended this game before it was decided, so there is no result to upload."
						: `Only Private Battle games are uploaded. This one was ${lobbyLabel(state.lobby) ?? "not a private battle"}.`,
			};
	}
}

function retryAction(onRetry: (() => void) | undefined) {
	return onRetry ? { label: "Retry", run: onRetry } : undefined;
}

function linkUrl(link: IngestedMatchLink): string {
	return link.type === "tournament"
		? tournamentMatchPage({
				tournamentId: link.tournamentId,
				matchId: link.matchId,
			})
		: sendouQMatchPage(link.groupMatchId);
}

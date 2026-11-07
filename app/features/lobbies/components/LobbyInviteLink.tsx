import { Check, Link, RefreshCw } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { ActionButton } from "~/components/ActionButton";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { toastQueue } from "~/components/elements/Toast";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { lobbyActionSchema } from "../lobbies-schemas";

/** The lobby's invite link to copy, for the host in a dialog that also resets it. */
export function LobbyInviteLink({
	link,
	isHost,
}: {
	link: string;
	isHost: boolean;
}) {
	if (!isHost) return <CopyInviteLinkButton link={link} />;

	return <HostInviteLinkDialog link={link} />;
}

function HostInviteLinkDialog({ link }: { link: string }) {
	const { t } = useTranslation(["lobbies", "common"]);
	const [isOpen, setIsOpen] = React.useState(false);
	const resetFetcher = useFetcher();
	const previousResetStateRef = React.useRef(resetFetcher.state);

	// a rejected reset redirects with an error toast instead, leaving its data unset
	React.useEffect(() => {
		if (
			previousResetStateRef.current !== "idle" &&
			resetFetcher.state === "idle" &&
			resetFetcher.data === null
		) {
			toastQueue.add(
				{ message: t("lobbies:shareLink.resetSuccess"), variant: "success" },
				{ timeout: 5000 },
			);
		}
		previousResetStateRef.current = resetFetcher.state;
	}, [resetFetcher.state, resetFetcher.data, t]);

	return (
		<>
			<SendouButton
				size="small"
				variant="outlined"
				icon={<Link />}
				onClick={() => setIsOpen(true)}
				testId="lobby-invite-link-button"
			>
				{t("common:inviteLink")}
			</SendouButton>
			{isOpen ? (
				<SendouDialog
					heading={t("common:inviteLink")}
					onClose={() => setIsOpen(false)}
				>
					<div className="stack md items-start">
						<p className="text-lighter text-sm">
							{t("lobbies:shareLink.explanation")}
						</p>
						<div className="stack horizontal sm">
							<CopyInviteLinkButton link={link} />
							<ActionButton
								schema={lobbyActionSchema}
								action="RESET_SHARE_KEY"
								fetcher={resetFetcher}
								variant="outlined"
								size="small"
								icon={<RefreshCw />}
								testId="lobby-reset-share-link-button"
							>
								{t("lobbies:shareLink.reset")}
							</ActionButton>
						</div>
					</div>
				</SendouDialog>
			) : null}
		</>
	);
}

function CopyInviteLinkButton({ link }: { link: string }) {
	const { t } = useTranslation(["lobbies"]);
	const { copyToClipboard, copySuccess } = useCopyToClipboard();

	return (
		<SendouButton
			variant={copySuccess ? "outlined-success" : "outlined"}
			size="small"
			icon={copySuccess ? <Check /> : <Link />}
			onClick={() => copyToClipboard(link)}
			testId="lobby-copy-share-link-button"
		>
			{t("lobbies:shareLink.copy")}
		</SendouButton>
	);
}

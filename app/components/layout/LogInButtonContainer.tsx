import { useSearchParams } from "@remix-run/react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { SendouDialog } from "~/components/elements/Dialog";
import { useIsMounted } from "~/hooks/useIsMounted";
import { LOG_IN_URL, SENDOU_INK_DISCORD_URL } from "~/utils/urls";

export function LogInButtonContainer({
	children,
}: {
	children: React.ReactNode;
}) {
	const { t } = useTranslation();
	const isMounted = useIsMounted();
	const [searchParams] = useSearchParams();
	const authError = searchParams.get("authError");

	return (
		<>
			<form action={LOG_IN_URL} method="post">
				{children}
			</form>
			{authError != null &&
				isMounted &&
				createPortal(
					<SendouDialog
						isDismissable
						onCloseTo="/"
						heading={
							authError === "aborted"
								? t("auth.errors.aborted")
								: t("auth.errors.failed")
						}
					>
						<div className="stack md layout__user-item">
							{authError === "aborted" ? (
								<>{t("auth.errors.discordPermissions")}</>
							) : (
								<>
									{t("auth.errors.unknown")}{" "}
									<a
										href={SENDOU_INK_DISCORD_URL}
										target="_blank"
										rel="noreferrer"
									>
										{SENDOU_INK_DISCORD_URL}
									</a>
								</>
							)}
						</div>
					</SendouDialog>,
					document.body,
				)}
		</>
	);
}

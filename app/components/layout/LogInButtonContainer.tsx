import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { SendouDialog } from "~/components/elements/Dialog";
import { useHydrated } from "~/hooks/useHydrated";
import { LOG_IN_URL, SENDOU_INK_DISCORD_URL } from "~/utils/urls";
import styles from "./UserItem.module.css";

export function LogInButtonContainer({
	children,
}: {
	children: React.ReactNode;
}) {
	const { t } = useTranslation();
	const isHydrated = useHydrated();
	const [searchParams] = useSearchParams();
	const authError = searchParams.get("authError");

	return (
		<>
			<form action={LOG_IN_URL} method="post" className="stack items-center">
				{children}
			</form>
			{authError != null &&
				isHydrated &&
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
						<div className={`stack md ${styles.userItem}`}>
							{authError === "aborted" ? (
								t("auth.errors.discordPermissions")
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

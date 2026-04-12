import type { TFunction } from "i18next";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { SendouDialog } from "~/components/elements/Dialog";
import { useUser } from "~/features/auth/core/user";
import { useHydrated } from "~/hooks/useHydrated";
import { SENDOU_INK_DISCORD_URL } from "~/utils/urls";
import styles from "./UserItem.module.css";

export function AuthErrorDialog() {
	const { t } = useTranslation();
	const isHydrated = useHydrated();
	const user = useUser();
	const [searchParams] = useSearchParams();
	const authError = searchParams.get("authError");

	if (authError == null || !isHydrated || user) return null;

	return createPortal(
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
				{authErrorContent(authError, t)}
			</div>
		</SendouDialog>,
		document.body,
	);
}

function authErrorContent(authError: string, t: TFunction) {
	switch (authError) {
		case "aborted":
			return t("auth.errors.discordPermissions");
		case "discordOverloaded":
			return (
				<>
					{t("auth.errors.discordOverloaded")}{" "}
					<a href={SENDOU_INK_DISCORD_URL} target="_blank" rel="noreferrer">
						{SENDOU_INK_DISCORD_URL}
					</a>
				</>
			);
		case "unverifiedEmail":
			return t("auth.errors.unverifiedEmail");
		case "browserPrivacy":
			return t("auth.errors.browserPrivacy");
		default:
			return (
				<>
					{t("auth.errors.unknown")}{" "}
					<a href={SENDOU_INK_DISCORD_URL} target="_blank" rel="noreferrer">
						{SENDOU_INK_DISCORD_URL}
					</a>
				</>
			);
	}
}

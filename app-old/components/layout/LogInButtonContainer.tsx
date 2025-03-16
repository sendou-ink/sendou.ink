import { useSearchParams } from "@remix-run/react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useIsMounted } from "~/hooks/useIsMounted";
import { LOG_IN_URL, SENDOU_INK_DISCORD_URL } from "~/utils/urls";
import { Button } from "../Button";
import { Dialog } from "../Dialog";

export function LogInButtonContainer({
	children,
}: {
	children: React.ReactNode;
}) {
	const isMounted = useIsMounted();
	const { t } = useTranslation();
	const [searchParams, setSearchParams] = useSearchParams();
	const authError = searchParams.get("authError");
	const closeAuthErrorDialog = () => {
		const newSearchParams = new URLSearchParams(searchParams);
		newSearchParams.delete("authError");
		setSearchParams(newSearchParams);
	};

	return (
		<>
			<form action={LOG_IN_URL} method="post">
				{children}
			</form>
			{authError != null &&
				isMounted &&
				createPortal(
					<Dialog isOpen close={closeAuthErrorDialog}>
						<div className="stack md layout__user-item">
							<AuthenticationErrorHelp errorCode={authError} />
							<Button onClick={closeAuthErrorDialog}>
								{t("actions.close")}
							</Button>
						</div>
					</Dialog>,
					document.body,
				)}
		</>
	);
}

function AuthenticationErrorHelp({ errorCode }: { errorCode: string }) {
	const { t } = useTranslation();

	switch (errorCode) {
		case "aborted":
			return (
				<>
					<h2 className="text-lg text-center">{t("auth.errors.aborted")}</h2>
					{t("auth.errors.discordPermissions")}
				</>
			);
		default:
			return (
				<>
					<h2 className="text-lg text-center">{t("auth.errors.failed")}</h2>
					{t("auth.errors.unknown")}{" "}
					<a href={SENDOU_INK_DISCORD_URL} target="_blank" rel="noreferrer">
						{SENDOU_INK_DISCORD_URL}
					</a>
				</>
			);
	}
}

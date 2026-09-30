import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { FormMessage } from "~/components/FormMessage";
import { FriendCodeInput } from "~/components/FriendCodeInput";
import { useUser } from "~/features/auth/core/user";

export function FriendCodePopover({ size }: { size?: "small" }) {
	const { t } = useTranslation(["common"]);
	const user = useUser();
	const friendCode = user?.friendCode;

	return (
		<SendouDialog
			key={String(Boolean(friendCode))}
			isDismissable
			heading={t("common:fc.title")}
			trigger={
				<SendouButton variant="outlined" size={size}>
					{friendCode ? `SW-${friendCode}` : t("common:fc.set")}
				</SendouButton>
			}
		>
			<div className="stack md">
				<FriendCodeInput friendCode={friendCode} />
				<FormMessage type="info">{t("common:fc.altingWarning")}</FormMessage>
				{friendCode ? (
					<FormMessage type="info">{t("common:fc.changeHelp")}</FormMessage>
				) : null}
			</div>
		</SendouDialog>
	);
}

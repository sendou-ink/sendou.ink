import { useTranslation } from "react-i18next";
import { Image } from "~/components/Image";
import { InfoPopover } from "~/components/InfoPopover";
import { addFriendCodeSchema } from "~/features/sendouq/q-schemas";
import { SendouForm } from "~/form/SendouForm";
import { navIconUrl, SENDOUQ_PAGE } from "~/utils/urls";

const FC_INFO_IMAGE_URL = navIconUrl("fc-info");

export function FriendCodeInput({
	friendCode,
}: {
	friendCode?: string | null;
}) {
	const { t } = useTranslation(["common"]);

	if (friendCode) {
		return <div className="font-bold text-center">SW-{friendCode}</div>;
	}

	return (
		<SendouForm
			schema={addFriendCodeSchema}
			action={SENDOUQ_PAGE}
			revalidateRoot
			submitButtonText={t("common:actions.save")}
		>
			{({ FormField }) => (
				<div className="stack sm">
					<FormField name="friendCode" />
					<div className="stack horizontal sm items-center text-lighter text-xs">
						{t("common:fc.onceSetStaffOnly")}
						<InfoPopover tiny>
							<div className="stack sm">
								<div className="text-xs font-bold">
									{t("common:fc.whereToFind")}
								</div>
								<Image
									path={FC_INFO_IMAGE_URL}
									alt={t("common:fc.whereToFind")}
									width={320}
								/>
							</div>
						</InfoPopover>
					</div>
				</div>
			)}
		</SendouForm>
	);
}

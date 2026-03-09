import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { Image } from "~/components/Image";
import { InfoPopover } from "~/components/InfoPopover";
import { Input } from "~/components/Input";
import { Label } from "~/components/Label";
import { SubmitButton } from "~/components/SubmitButton";
import { FRIEND_CODE_REGEXP_PATTERN } from "~/features/sendouq/q-constants";
import { SENDOUQ_PAGE } from "~/utils/urls";

const FC_INFO_IMAGE_URL = "/static-assets/img/layout/fc-info";

export function FriendCodeInput({
	friendCode,
}: {
	friendCode?: string | null;
}) {
	const fetcher = useFetcher();
	const { t } = useTranslation(["common"]);
	const id = React.useId();

	return (
		<fetcher.Form method="post" action={SENDOUQ_PAGE}>
			<div
				className={clsx("stack sm horizontal items-end", {
					"justify-center": friendCode,
				})}
			>
				<div>
					{!friendCode ? (
						<div className="stack horizontal xs items-center">
							<Label htmlFor={id}>{t("common:fc.title")}</Label>
							<InfoPopover tiny>
								<div className="stack sm">
									<div>{t("common:fc.helpText")}</div>
									<div className="text-lighter text-xs font-bold">
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
					) : null}
					{friendCode ? (
						<div className="font-bold">SW-{friendCode}</div>
					) : (
						<Input
							leftAddon="SW-"
							id={id}
							name="friendCode"
							pattern={FRIEND_CODE_REGEXP_PATTERN}
							placeholder="1234-5678-9012"
							required
						/>
					)}
				</div>
				{!friendCode ? (
					<SubmitButton _action="ADD_FRIEND_CODE" state={fetcher.state}>
						Save
					</SubmitButton>
				) : null}
			</div>
			{!friendCode ? (
				<div className="text-lighter text-xs mt-2">
					{t("common:fc.onceSetStaffOnly")}
				</div>
			) : null}
		</fetcher.Form>
	);
}

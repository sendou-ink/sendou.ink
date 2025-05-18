import { useFetcher } from "@remix-run/react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Input } from "~/components/Input";
import { Label } from "~/components/Label";
import { SubmitButton } from "~/components/SubmitButton";
import { FRIEND_CODE_REGEXP_PATTERN } from "~/features/sendouq/q-constants";
import { SENDOUQ_PAGE } from "~/utils/urls";

export function FriendCodeInput({
	friendCode,
}: {
	friendCode?: string | null;
}) {
	const fetcher = useFetcher();
	const { t } = useTranslation(["common"]);

	return (
		<fetcher.Form method="post" action={SENDOUQ_PAGE}>
			<div
				className={clsx("stack sm horizontal items-end", {
					"justify-center": friendCode,
				})}
			>
				<div>
					{!friendCode ? (
						<Label htmlFor="friendCode">{t("common:fc.title")}</Label>
					) : null}
					{friendCode ? (
						<div className="font-bold">SW-{friendCode}</div>
					) : (
						<Input
							leftAddon="SW-"
							id="friendCode"
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
		</fetcher.Form>
	);
}

import { Eye, RefreshCcw } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { CopyToClipboardPopover } from "~/components/CopyToClipboardPopover";
import { SendouButton } from "~/components/elements/Button";
import { FormMessage } from "~/components/FormMessage";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { metaTags } from "~/utils/remix";
import { API_DOC_LINK } from "~/utils/urls";
import { action } from "../actions/api.server";
import { loader } from "../loaders/api.server";
export { loader, action };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "API Access",
		location: args.location,
	});
};

export default function ApiPage() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["common"]);

	return (
		<Main className="stack lg">
			<div>
				<h1 className="text-lg">{t("common:api.title")}</h1>
				<p className="text-sm">
					<Trans t={t} i18nKey="common:api.description">
						Generate an API token to access the sendou.ink API. See the
						<a href={API_DOC_LINK} className="text-theme">
							API documentation
						</a>
						for available endpoints, usage examples and guidelines to follow.
					</Trans>
				</p>
			</div>

			{!data.hasAccess ? (
				<div>
					<FormMessage type="info">{t("common:api.noAccess")}</FormMessage>
				</div>
			) : data.apiToken ? (
				<div className="stack md">
					<div>
						<label>{t("common:api.tokenLabel")}</label>
						<CopyToClipboardPopover
							url={data.apiToken}
							trigger={
								<SendouButton icon={<Eye />}>
									{t("common:api.revealButton")}
								</SendouButton>
							}
						/>
					</div>

					<FormWithConfirm
						dialogHeading={t("common:api.regenerate.heading")}
						submitButtonText={t("common:api.regenerate.confirm")}
						fields={[["_action", "GENERATE"]]}
					>
						<SendouButton
							className="mx-auto"
							variant="outlined"
							icon={<RefreshCcw />}
						>
							{t("common:api.regenerate.button")}
						</SendouButton>
					</FormWithConfirm>
				</div>
			) : (
				<form method="post">
					<SubmitButton _action="GENERATE">
						{t("common:api.generate")}
					</SubmitButton>
				</form>
			)}
		</Main>
	);
}

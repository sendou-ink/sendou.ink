import { Eye, RefreshCcw } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { ActionButton } from "~/components/ActionButton";
import { CopyToClipboardPopover } from "~/components/CopyToClipboardPopover";
import { SendouButton } from "~/components/elements/Button";
import { FormMessage } from "~/components/FormMessage";
import { Main } from "~/components/Main";
import { metaTags } from "~/utils/remix";
import { API_DOC_LINK } from "~/utils/urls";
import { action } from "../actions/api.server";
import { apiActionSchema } from "../api-schemas";
import { loader } from "../loaders/api.server";

export { action, loader };

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
			) : (
				<div className="stack lg">
					<TokenSection
						token={data.readToken}
						tokenType="read"
						generateAction="GENERATE_READ"
					/>
					<TokenSection
						token={data.writeToken}
						tokenType="write"
						generateAction="GENERATE_WRITE"
					/>
				</div>
			)}
		</Main>
	);
}

function TokenSection({
	token,
	tokenType,
	generateAction,
}: {
	token: string | null;
	tokenType: "read" | "write";
	generateAction: "GENERATE_READ" | "GENERATE_WRITE";
}) {
	const { t } = useTranslation(["common"]);

	const isWriteToken = tokenType === "write";
	const labelKey = isWriteToken
		? "common:api.writeTokenLabel"
		: "common:api.readTokenLabel";
	const descriptionKey = isWriteToken
		? "common:api.writeTokenDescription"
		: "common:api.readTokenDescription";

	return (
		<div className="stack md">
			<div>
				<h2 className="text-md">{t(labelKey)}</h2>
				<p className="text-xs text-lighter">{t(descriptionKey)}</p>
			</div>

			{token ? (
				<div>
					<CopyToClipboardPopover
						url={token}
						trigger={
							<SendouButton icon={<Eye />}>
								{t("common:api.revealButton")}
							</SendouButton>
						}
					/>
				</div>
			) : null}
			<ActionButton
				schema={apiActionSchema}
				action={generateAction}
				variant={token ? "outlined" : undefined}
				icon={token ? <RefreshCcw /> : undefined}
				confirm={
					token
						? {
								dialogHeading: t("common:api.regenerate.heading"),
								submitButtonText: t("common:api.regenerate.confirm"),
							}
						: undefined
				}
			>
				{token ? t("common:api.regenerate.button") : t("common:api.generate")}
			</ActionButton>
		</div>
	);
}

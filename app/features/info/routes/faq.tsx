import type { MetaFunction } from "@remix-run/node";
import { useTranslation } from "react-i18next";
import { Main } from "~/components/Main";
import { useSetTitle } from "~/hooks/useSetTitle";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { makeTitle } from "~/utils/strings";

import "~/styles/faq.css";

const AMOUNT_OF_QUESTIONS = 9;

// xxx: meta
export const meta: MetaFunction = () => {
	return [
		{ title: makeTitle("FAQ") },
		{ name: "description", content: "Frequently asked questions" },
	];
};

export const handle: SendouRouteHandle = {
	i18n: "faq",
};

export default function FAQPage() {
	const { t } = useTranslation(["faq", "common"]);
	useSetTitle(t("common:pages.faq"));

	return (
		<Main className="stack md">
			{new Array(AMOUNT_OF_QUESTIONS).fill(null).map((_, i) => {
				const questionNumber = i + 1;
				return (
					<details key={i} className="faq__details">
						<summary className="faq__summary">
							{t(`faq:q${questionNumber}` as any)}
						</summary>
						<p
							// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted source
							dangerouslySetInnerHTML={{
								__html: t(`faq:a${questionNumber}` as any),
							}}
						/>
					</details>
				);
			})}
		</Main>
	);
}

import type { MetaFunction } from "@remix-run/node";
import { useTranslation } from "react-i18next";
import { Main } from "~/components/Main";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";

import "~/styles/faq.css";

const AMOUNT_OF_QUESTIONS = 9;

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "FAQ",
		description: "Frequently asked questions",
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: "faq",
};

export default function FAQPage() {
	const { t } = useTranslation(["faq", "common"]);

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

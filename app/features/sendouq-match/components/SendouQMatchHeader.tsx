import { Scale } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LinkButton } from "~/components/elements/Button";
import { MatchPageHeader } from "~/components/match-page/MatchPageHeader";
import * as Seasons from "~/features/mmr/core/Seasons";
import { databaseTimestampToDate } from "~/utils/dates";
import { SENDOUQ_RULES_PAGE } from "~/utils/urls";
import type { SendouQMatchLoaderData } from "../loaders/q.match.$id.server";

export function SendouQMatchHeader({ data }: { data: SendouQMatchLoaderData }) {
	const { t } = useTranslation(["q"]);

	const season = Seasons.currentOrPrevious(
		databaseTimestampToDate(data.match.createdAt),
	)?.nth;

	return (
		<MatchPageHeader
			subtitle={`SendouQ Season ${season}`}
			topRight={
				<LinkButton
					to={SENDOUQ_RULES_PAGE}
					variant="outlined"
					size="small"
					icon={<Scale />}
				>
					{t("q:front.nav.rules.title")}
				</LinkButton>
			}
		>
			{t("q:match.header", { number: data.match.id })}
		</MatchPageHeader>
	);
}

import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { Divider } from "~/components/Divider";
import {
	Trophy,
	TrophyContextProvider,
	TrophyGrid,
} from "~/features/trophies/components/Trophy";
import { TrophyShowcaseModal } from "~/features/trophies/components/TrophyShowcase";
import { TrophyTournamentHistory } from "~/features/trophies/components/TrophyTournamentHistory";
import type { TrophyTournamentsLoaderData } from "~/features/trophies/routes/trophies.$id.tournaments";
import { useProgressiveRender } from "~/features/trophies/trophies-utils";
import type { SerializeFrom } from "~/utils/remix";
import { trophyTournamentsPage } from "~/utils/urls";
import type { loader } from "../loaders/org.$slug.server";
import styles from "./OrgTrophyGrid.module.css";

/** Grid of the trophies an organization hands out, each opening a showcase with its tournament history. */
export function OrgTrophyGrid({
	trophies,
}: {
	trophies: SerializeFrom<typeof loader>["trophies"];
}) {
	const visibleCount = useProgressiveRender(trophies.length, "");
	const [openTrophy, setOpenTrophy] = React.useState<
		SerializeFrom<typeof loader>["trophies"][number] | null
	>(null);

	return (
		<TrophyContextProvider>
			<TrophyGrid>
				{trophies.map((trophy, i) => (
					<button
						key={trophy.id}
						type="button"
						onClick={() => setOpenTrophy(trophy)}
						aria-label={trophy.name}
					>
						<Trophy
							model={trophy.model}
							tier={trophy.tier}
							tentativeTier={trophy.tentativeTier}
							preview
							deferred={i >= visibleCount}
						/>
					</button>
				))}
			</TrophyGrid>
			{openTrophy ? (
				<TrophyShowcaseModal
					trophy={openTrophy}
					onClose={() => setOpenTrophy(null)}
				>
					<TrophyModalTournaments
						key={openTrophy.id}
						trophyId={openTrophy.id}
					/>
				</TrophyShowcaseModal>
			) : null}
		</TrophyContextProvider>
	);
}

function TrophyModalTournaments({ trophyId }: { trophyId: number }) {
	const { t } = useTranslation(["trophies"]);
	const fetcher = useFetcher<TrophyTournamentsLoaderData>();

	const loadedRef = React.useRef(false);
	React.useEffect(() => {
		if (loadedRef.current) return;
		loadedRef.current = true;
		fetcher.load(trophyTournamentsPage(trophyId));
	}, [fetcher.load, trophyId]);

	if (!fetcher.data || fetcher.data.tournaments.length === 0) return null;

	return (
		<div className={styles.modalTournaments}>
			<Divider smallText>{t("trophies:details.tournamentHistory")}</Divider>
			<TrophyTournamentHistory tournaments={fetcher.data.tournaments} />
		</div>
	);
}

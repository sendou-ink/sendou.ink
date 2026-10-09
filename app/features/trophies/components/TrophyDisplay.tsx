import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { Avatar } from "~/components/Avatar";
import { Divider } from "~/components/Divider";
import { DotPagination } from "~/components/DotPagination";
import { WeaponImage } from "~/components/Image";
import { DivisionImage } from "~/features/top-search/components/DivisionImage";
import type { XRankPlacementRegion } from "~/features/top-search/top-search-types";
import { UserCard } from "~/features/user-card/components/UserCard";
import { ParticipationPill } from "~/features/user-page/components/ParticipationPill";
import { usePagination } from "~/hooks/usePagination";
import { trophyPlacementsPage, trophyWinsPage } from "~/utils/urls";
import * as XpTrophy from "../core/XpTrophy";
import type { TrophyPlacementsLoaderData } from "../routes/trophies.$id.placements.$userId";
import type { TrophyWinsLoaderData } from "../routes/trophies.$id.wins.$userId";
import { SMALL_TROPHIES_PER_DISPLAY_PAGE } from "../trophies-constants";
import { useProgressiveRender } from "../trophies-utils";
import { TournamentSummaryRow } from "./TournamentSummaryRow";
import { Trophy, TrophyContextProvider, TrophyGrid } from "./Trophy";
import styles from "./TrophyDisplay.module.css";
import { TrophyShowcaseModal } from "./TrophyShowcase";
import { XPlacementSummaryRow } from "./XPlacementSummaryRow";

type TrophyItem = {
	id: number;
	name: string;
	model: string;
	tier?: number | null;
	code?: string | null;
	count?: number | null;
	/** Division an X Power trophy was won in. */
	division?: XRankPlacementRegion | null;
};

export interface TrophyDisplayProps {
	trophies: Array<TrophyItem>;
	userId: number;
	className?: string;
}

export function TrophyDisplay({
	trophies,
	userId,
	className,
}: TrophyDisplayProps) {
	const { t } = useTranslation(["common"]);
	const [openTrophy, setOpenTrophy] = React.useState<TrophyItem | null>(null);

	const {
		itemsToDisplay,
		everythingVisible,
		currentPage,
		pagesCount,
		setPage,
	} = usePagination({
		items: trophies,
		pageSize: SMALL_TROPHIES_PER_DISPLAY_PAGE,
		scrollToTop: false,
	});

	const visibleCount = useProgressiveRender(
		itemsToDisplay.length,
		String(currentPage),
	);

	if (trophies.length === 0) return null;

	return (
		<TrophyContextProvider>
			<div
				data-testid="trophy-display"
				className={clsx(className, styles.root)}
			>
				<TrophyGrid columns={3}>
					{itemsToDisplay.map((trophy, i) => (
						<button
							key={trophy.id}
							type="button"
							onClick={() => setOpenTrophy(trophy)}
							aria-label={trophy.name}
						>
							<Trophy
								model={trophy.model}
								code={trophy.code}
								tier={trophy.tier ?? null}
								preview={!!openTrophy}
								staticOnSoftwareRendering
								disableCameraControls
								fps={30}
								deferred={i >= visibleCount}
								pill={
									trophy.division ? (
										<DivisionImage
											region={trophy.division}
											size={16}
											alt={t(`common:divisions.${trophy.division}`)}
										/>
									) : trophy.count && trophy.count > 1 ? (
										`×${trophy.count}`
									) : undefined
								}
							/>
						</button>
					))}
				</TrophyGrid>
				{!everythingVisible ? (
					<DotPagination
						pagesCount={pagesCount}
						currentPage={currentPage}
						setPage={setPage}
						ariaLabelPrefix="Trophies"
						data-testid="trophy-pagination-button"
					/>
				) : null}
			</div>
			{openTrophy ? (
				<TrophyModal
					trophy={openTrophy}
					userId={userId}
					onClose={() => setOpenTrophy(null)}
				/>
			) : null}
		</TrophyContextProvider>
	);
}

function TrophyModal({
	trophy,
	userId,
	onClose,
}: {
	trophy: TrophyItem;
	userId: number;
	onClose: () => void;
}) {
	const { t } = useTranslation(["trophies", "common"]);
	const fetcher = useFetcher<TrophyWinsLoaderData>();
	const placementsFetcher = useFetcher<TrophyPlacementsLoaderData>();
	const data = fetcher.data;
	const placements = placementsFetcher.data?.placements;

	const xpVariant = XpTrophy.parseCode(trophy.code);

	const loadedRef = React.useRef(false);
	React.useEffect(() => {
		if (loadedRef.current) return;
		loadedRef.current = true;

		if (XpTrophy.parseCode(trophy.code)) {
			placementsFetcher.load(
				trophyPlacementsPage({ trophyId: trophy.id, userId }),
			);
		} else {
			fetcher.load(trophyWinsPage({ trophyId: trophy.id, userId }));
		}
	}, [fetcher.load, placementsFetcher.load, trophy.id, trophy.code, userId]);

	return (
		<TrophyShowcaseModal trophy={trophy} onClose={onClose}>
			{xpVariant ? (
				<div>
					<Divider />
					<p className={styles.specialDescription}>
						{t("trophies:special.xp.categoryDescription", {
							value: xpVariant.milestone,
							category: t(
								`common:weapon.category.${XpTrophy.categoryKey(xpVariant.category)}`,
							),
						})}
					</p>
				</div>
			) : null}
			{placements && placements.length > 0 ? (
				<div className="stack xs">
					<Divider />
					<div className={styles.placements}>
						{placements.map((placement) => (
							<XPlacementSummaryRow key={placement.id} placement={placement} />
						))}
					</div>
				</div>
			) : null}
			{data
				? data.wins.map((win) => (
						<div key={win.tournamentId}>
							<Divider />
							<TrophyWinDetails win={win} userCards={data.userCards} />
						</div>
					))
				: null}
		</TrophyShowcaseModal>
	);
}

function TrophyWinDetails({
	win,
	userCards,
}: {
	win: TrophyWinsLoaderData["wins"][number];
	userCards: TrophyWinsLoaderData["userCards"];
}) {
	return (
		<div className={styles.win}>
			<TournamentSummaryRow tournament={win} className={styles.winHeader} />
			<div className={styles.winDetails}>
				{win.members.length > 0 ? (
					<div className={styles.winMembers}>
						{win.members.map((member) => (
							<div key={member.id} className={styles.winMember}>
								<UserCard data={userCards.get(member.id)}>
									<span className={styles.winMemberUser}>
										<Avatar size="xxxs" user={member} />
										<span className="truncate">{member.username}</span>
									</span>
								</UserCard>
								<span className={styles.winMemberWeapons}>
									{member.weapons.map((weaponSplId) => (
										<WeaponImage
											key={weaponSplId}
											weaponSplId={weaponSplId}
											variant="badge"
											width={24}
											height={24}
										/>
									))}
								</span>
								<ParticipationPill setResults={member.setResults} />
							</div>
						))}
					</div>
				) : null}
			</div>
		</div>
	);
}

import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { Avatar } from "~/components/Avatar";
import { Divider } from "~/components/Divider";
import { DotPagination } from "~/components/DotPagination";
import { WeaponImage } from "~/components/Image";
import { UserCard } from "~/features/user-card/components/UserCard";
import { ParticipationPill } from "~/features/user-page/components/ParticipationPill";
import { usePagination } from "~/hooks/usePagination";
import { roundToNDecimalPlaces } from "~/utils/number";
import { trophyWinsPage } from "~/utils/urls";
import type { TrophyWinsLoaderData } from "../routes/trophies.$id.wins.$userId";
import { SMALL_TROPHIES_PER_DISPLAY_PAGE } from "../trophies-constants";
import {
	parseSpecialTrophyCode,
	useProgressiveRender,
} from "../trophies-utils";
import { TournamentSummaryRow } from "./TournamentSummaryRow";
import { Trophy, TrophyContextProvider, TrophyPlaceholder } from "./Trophy";
import styles from "./TrophyDisplay.module.css";
import { TrophyShowcaseModal } from "./TrophyShowcase";

type TrophyItem = {
	id: number;
	name: string;
	model: string;
	tier?: number | null;
	code?: string | null;
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
				<div className={styles.grid}>
					{itemsToDisplay.map((trophy, i) =>
						i < visibleCount ? (
							<button
								key={trophy.id}
								type="button"
								className={styles.trophyButton}
								onClick={() => setOpenTrophy(trophy)}
								aria-label={trophy.name}
							>
								<Trophy
									tile
									model={trophy.model}
									tier={trophy.tier ?? null}
									preview={!!openTrophy}
									disableCameraControls
								/>
							</button>
						) : (
							<TrophyPlaceholder key={trophy.id} />
						),
					)}
				</div>
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
	const { t } = useTranslation(["trophies"]);
	const fetcher = useFetcher<TrophyWinsLoaderData>();
	const data = fetcher.data;

	const special = parseSpecialTrophyCode(trophy.code);

	const loadedRef = React.useRef(false);
	React.useEffect(() => {
		if (parseSpecialTrophyCode(trophy.code) || loadedRef.current) return;
		loadedRef.current = true;
		fetcher.load(trophyWinsPage({ trophyId: trophy.id, userId }));
	}, [fetcher.load, trophy.id, trophy.code, userId]);

	return (
		<TrophyShowcaseModal trophy={trophy} onClose={onClose}>
			{special ? (
				<div>
					<Divider />
					<p className={styles.specialDescription}>
						{special.type === "supporter"
							? t("trophies:special.supporter.description")
							: t("trophies:special.xp.description", {
									value: special.value,
								})}
					</p>
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
										<span className={styles.winMemberName}>
											{member.username}
										</span>
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
				{win.spDiff ? (
					<div className={styles.winSp}>
						{win.spDiff > 0 ? (
							<span className="text-success">▲</span>
						) : (
							<span className="text-warning">▼</span>
						)}
						{Math.abs(roundToNDecimalPlaces(win.spDiff))}SP
					</div>
				) : null}
			</div>
		</div>
	);
}

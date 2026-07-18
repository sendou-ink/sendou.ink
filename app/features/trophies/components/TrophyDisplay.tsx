import clsx from "clsx";
import * as React from "react";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { usePagination } from "~/hooks/usePagination";
import { SMALL_TROPHIES_PER_DISPLAY_PAGE } from "../trophies-constants";
import { useProgressiveRender } from "../trophies-utils";
import { Trophy, TrophyContextProvider } from "./Trophy";
import styles from "./TrophyDisplay.module.css";

type TrophyItem = {
	id: number;
	name: string;
	model: string;
	tier?: number | null;
};

export interface TrophyDisplayProps {
	trophies: Array<TrophyItem>;
	className?: string;
}

export function TrophyDisplay({ trophies, className }: TrophyDisplayProps) {
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
									className={styles.trophy}
									model={trophy.model}
									tier={trophy.tier ?? null}
									preview={!!openTrophy}
									disableCameraControls
								/>
							</button>
						) : (
							<div key={trophy.id} className={styles.placeholder} />
						),
					)}
				</div>
				{!everythingVisible ? (
					<TrophyPagination
						pagesCount={pagesCount}
						currentPage={currentPage}
						setPage={setPage}
					/>
				) : null}
			</div>
			{openTrophy ? (
				<SendouDialog
					isOpen={Boolean(openTrophy)}
					onClose={() => setOpenTrophy(null)}
					showHeading={false}
					className={styles.modal}
				>
					<div className={styles.modalContent}>
						<Trophy className={styles.modalTrophy} model={openTrophy.model} />
						<div className={styles.modalDetails}>
							<p className={styles.modalTrophyName}>{openTrophy.name}</p>
						</div>
					</div>
				</SendouDialog>
			) : null}
		</TrophyContextProvider>
	);
}

interface TrophyPaginationProps {
	pagesCount: number;
	currentPage: number;
	setPage: (page: number) => void;
}

function TrophyPagination({
	pagesCount,
	currentPage,
	setPage,
}: TrophyPaginationProps) {
	return (
		<div className={styles.pagination}>
			{Array.from({ length: pagesCount }, (_, i) => (
				<SendouButton
					key={i}
					variant="minimal"
					aria-label={`Trophies page ${i + 1}`}
					onPress={() => setPage(i + 1)}
					className={clsx(styles.paginationButton, {
						[styles.paginationButtonActive]: currentPage === i + 1,
					})}
					data-testid="trophy-pagination-button"
				>
					{i + 1}
				</SendouButton>
			))}
		</div>
	);
}

import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SendouButton } from "~/components/elements/Button";
import { nullFilledArray } from "~/utils/arrays";
import styles from "./Pagination.module.css";

export function Pagination({
	currentPage,
	pagesCount,
	nextPage,
	previousPage,
	setPage,
}: {
	currentPage: number;
	pagesCount: number;
	nextPage: () => void;
	previousPage: () => void;
	setPage: (page: number) => void;
}) {
	return (
		<div className={styles.container}>
			<SendouButton
				icon={<ChevronLeft />}
				variant="outlined"
				className="fix-rtl"
				isDisabled={currentPage === 1}
				onPress={previousPage}
				aria-label="Previous page"
			/>
			<div className={styles.dots}>
				{nullFilledArray(pagesCount).map((_, i) => (
					// biome-ignore lint/a11y/noStaticElementInteractions: Biome v2 migration
					<div
						key={i}
						className={clsx(styles.dot, {
							[styles.dotActive]: i === currentPage - 1,
						})}
						onClick={() => setPage(i + 1)}
					/>
				))}
			</div>
			<div className={styles.pageCount}>
				{currentPage}/{pagesCount}
			</div>
			<SendouButton
				icon={<ChevronRight />}
				variant="outlined"
				className="fix-rtl"
				isDisabled={currentPage === pagesCount}
				onPress={nextPage}
				aria-label="Next page"
			/>
		</div>
	);
}

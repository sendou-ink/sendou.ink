import clsx from "clsx";
import { SendouButton } from "~/components/elements/Button";
import { ArrowLeftIcon } from "~/components/icons/ArrowLeft";
import { ArrowRightIcon } from "~/components/icons/ArrowRight";
import { nullFilledArray } from "~/utils/arrays";

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
		<div className="pagination__container">
			<SendouButton
				icon={<ArrowLeftIcon />}
				variant="outlined"
				className="fix-rtl"
				isDisabled={currentPage === 1}
				onPress={previousPage}
				aria-label="Previous page"
			/>
			<div className="pagination__dots">
				{nullFilledArray(pagesCount).map((_, i) => (
					<div
						key={i}
						className={clsx("pagination__dot", {
							pagination__dot__active: i === currentPage - 1,
						})}
						onClick={() => setPage(i + 1)}
					/>
				))}
			</div>
			<div className="pagination__page-count">
				{currentPage}/{pagesCount}
			</div>
			<SendouButton
				icon={<ArrowRightIcon />}
				variant="outlined"
				className="fix-rtl"
				isDisabled={currentPage === pagesCount}
				onPress={nextPage}
				aria-label="Next page"
			/>
		</div>
	);
}

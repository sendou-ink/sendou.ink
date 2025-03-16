import clsx from "clsx";
import { Button } from "~/components/Button";
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
		<div className="stack sm horizontal items-center justify-center flex-wrap">
			<Button
				icon={<ArrowLeftIcon />}
				variant="outlined"
				className="fix-rtl"
				disabled={currentPage === 1}
				onClick={previousPage}
				aria-label="Previous page"
			/>
			{nullFilledArray(pagesCount).map((_, i) => (
				<div
					key={i}
					className={clsx("pagination__dot", {
						pagination__dot__active: i === currentPage - 1,
					})}
					onClick={() => setPage(i + 1)}
				/>
			))}
			<div className="pagination__page-count">
				{currentPage}/{pagesCount}
			</div>
			<Button
				icon={<ArrowRightIcon />}
				variant="outlined"
				className="fix-rtl"
				disabled={currentPage === pagesCount}
				onClick={nextPage}
				aria-label="Next page"
			/>
		</div>
	);
}

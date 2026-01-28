import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
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
	const pages = getPageNumbers(currentPage, pagesCount);
	const [jumpToIndex, setJumpToIndex] = React.useState<number | null>(null);

	return (
		<div className={styles.container}>
			<button
				type="button"
				className={styles.arrow}
				disabled={currentPage === 1}
				onClick={previousPage}
				aria-label="Previous page"
			>
				<ChevronLeft size={18} />
			</button>
			{pages.map((page, index) =>
				page.value === "..." ? (
					<JumpToEllipsis
						key={`ellipsis-${index}`}
						isOpen={jumpToIndex === index}
						pagesCount={pagesCount}
						desktopOnly={page.desktopOnly}
						mobileOnly={page.mobileOnly}
						onOpen={() => setJumpToIndex(index)}
						onClose={() => setJumpToIndex(null)}
						onJump={(page) => {
							setPage(page);
							setJumpToIndex(null);
						}}
					/>
				) : (
					<PageButton
						key={page.value}
						page={page.value}
						currentPage={currentPage}
						desktopOnly={page.desktopOnly}
						setPage={setPage}
					/>
				),
			)}
			<button
				type="button"
				className={styles.arrow}
				disabled={currentPage === pagesCount}
				onClick={nextPage}
				aria-label="Next page"
			>
				<ChevronRight size={18} />
			</button>
		</div>
	);
}

function JumpToEllipsis({
	isOpen,
	pagesCount,
	desktopOnly,
	mobileOnly,
	onOpen,
	onClose,
	onJump,
}: {
	isOpen: boolean;
	pagesCount: number;
	desktopOnly?: boolean;
	mobileOnly?: boolean;
	onOpen: () => void;
	onClose: () => void;
	onJump: (page: number) => void;
}) {
	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const formData = new FormData(e.currentTarget);
		const value = formData.get("page") as string;
		if (!value) {
			onClose();
			return;
		}

		const pageNumber = Number(value);
		if (Number.isNaN(pageNumber) || pageNumber < 1 || pageNumber > pagesCount) {
			onClose();
			return;
		}

		onJump(pageNumber);
	};

	const handleBlur = () => {
		onClose();
	};

	if (isOpen) {
		return (
			<form
				onSubmit={handleSubmit}
				className={clsx(styles.jumpToForm, {
					[styles.desktopOnly]: desktopOnly,
					[styles.mobileOnly]: mobileOnly,
				})}
			>
				<input
					// biome-ignore lint/a11y/noAutofocus: valid use case
					autoFocus
					name="page"
					type="text"
					inputMode="numeric"
					pattern="[0-9]*"
					className={styles.jumpToInput}
					onBlur={handleBlur}
					aria-label={`Jump to page (1-${pagesCount})`}
				/>
			</form>
		);
	}

	return (
		<button
			type="button"
			className={clsx(styles.ellipsis, styles.ellipsisButton, {
				[styles.desktopOnly]: desktopOnly,
				[styles.mobileOnly]: mobileOnly,
			})}
			onClick={onOpen}
			aria-label="Jump to page"
		>
			...
		</button>
	);
}

function PageButton({
	page,
	currentPage,
	desktopOnly,
	setPage,
}: {
	page: number;
	currentPage: number;
	desktopOnly?: boolean;
	setPage: (page: number) => void;
}) {
	return (
		<button
			type="button"
			className={clsx(styles.page, {
				[styles.pageActive]: page === currentPage,
				[styles.desktopOnly]: desktopOnly,
			})}
			onClick={() => setPage(page)}
			aria-current={page === currentPage ? "page" : undefined}
		>
			{page}
		</button>
	);
}

type PageItem = {
	value: number | "...";
	desktopOnly?: boolean;
	mobileOnly?: boolean;
};

function getPageNumbers(currentPage: number, pagesCount: number): PageItem[] {
	if (pagesCount <= 5) {
		return Array.from({ length: pagesCount }, (_, i) => ({ value: i + 1 }));
	}

	if (pagesCount <= 9) {
		return Array.from({ length: pagesCount }, (_, i) => ({
			value: i + 1,
			desktopOnly: i >= 2 && i < pagesCount - 2,
		}));
	}

	const mobileStart = Math.max(2, currentPage - 1);
	const mobileEnd = Math.min(pagesCount - 1, currentPage + 1);
	const desktopStart = Math.max(2, currentPage - 2);
	const desktopEnd = Math.min(pagesCount - 1, currentPage + 2);

	const isMobileVisible = (page: number) =>
		page >= mobileStart && page <= mobileEnd;
	const isDesktopVisible = (page: number) =>
		page >= desktopStart && page <= desktopEnd;

	const pages: PageItem[] = [];

	pages.push({ value: 1 });

	const needsDesktopEllipsisStart = desktopStart > 2;
	const needsMobileEllipsisStart = mobileStart > 2;

	if (needsDesktopEllipsisStart && needsMobileEllipsisStart) {
		pages.push({ value: "..." });
	} else if (needsMobileEllipsisStart) {
		pages.push({ value: "...", mobileOnly: true });
	} else if (needsDesktopEllipsisStart) {
		pages.push({ value: "...", desktopOnly: true });
	}

	for (let i = 2; i <= pagesCount - 1; i++) {
		if (isDesktopVisible(i)) {
			pages.push({ value: i, desktopOnly: !isMobileVisible(i) });
		}
	}

	const needsDesktopEllipsisEnd = desktopEnd < pagesCount - 1;
	const needsMobileEllipsisEnd = mobileEnd < pagesCount - 1;

	if (needsDesktopEllipsisEnd && needsMobileEllipsisEnd) {
		pages.push({ value: "..." });
	} else if (needsMobileEllipsisEnd) {
		pages.push({ value: "...", mobileOnly: true });
	} else if (needsDesktopEllipsisEnd) {
		pages.push({ value: "...", desktopOnly: true });
	}

	pages.push({ value: pagesCount });

	return pages;
}

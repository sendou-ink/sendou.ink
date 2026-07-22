import { clsx } from "clsx";
import { SendouButton } from "~/components/elements/Button";
import styles from "./DotPagination.module.css";

export function DotPagination({
	pagesCount,
	currentPage,
	setPage,
	ariaLabelPrefix,
	"data-testid": testId,
	className,
}: {
	pagesCount: number;
	currentPage: number;
	setPage: (page: number) => void;
	ariaLabelPrefix: string;
	"data-testid"?: string;
	className?: string;
}) {
	return (
		<div className={clsx(styles.pagination, className)}>
			{Array.from({ length: pagesCount }, (_, i) => (
				<SendouButton
					key={i}
					variant="minimal"
					aria-label={`${ariaLabelPrefix} page ${i + 1}`}
					onPress={() => setPage(i + 1)}
					className={clsx(styles.button, {
						[styles.buttonActive]: currentPage === i + 1,
					})}
					data-testid={testId}
				>
					{i + 1}
				</SendouButton>
			))}
		</div>
	);
}

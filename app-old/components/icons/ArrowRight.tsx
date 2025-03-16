import type { CSSProperties } from "react";

export function ArrowRightIcon({
	className,
	style,
}: {
	className?: string;
	style?: CSSProperties;
}) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			className={className}
			style={style}
			viewBox="0 0 20 20"
			fill="currentColor"
		>
			<title>Arrow Right Icon</title>
			<path
				fillRule="evenodd"
				d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
				clipRule="evenodd"
			/>
		</svg>
	);
}

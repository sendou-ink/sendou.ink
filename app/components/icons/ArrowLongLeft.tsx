export function ArrowLongLeftIcon({
	className,
	title,
}: {
	className?: string;
	title?: string;
}) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			strokeWidth={2}
			stroke="currentColor"
			className={className}
		>
			{title ? <title>{title}</title> : null}
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M6.75 15.75L3 12m0 0l3.75-3.75M3 12h18"
			/>
		</svg>
	);
}

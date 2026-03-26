export function MainSlotIcon({
	className,
	size,
}: {
	className?: string;
	size?: number;
}) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			className={className}
			width={size}
			height={size}
		>
			{/* Left column - filled */}
			<path
				d="M3 6a3 3 0 0 1 3 -3h7v18h-7a3 3 0 0 1 -3 -3z"
				fill="currentColor"
				stroke="none"
			/>
			{/* Right column - outlined */}
			<path
				d="M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

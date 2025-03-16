export function Section({
	title,
	children,
	className,
}: {
	title?: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<section className="section">
			{title && <h2>{title}</h2>}
			<div className={className}>{children}</div>
		</section>
	);
}

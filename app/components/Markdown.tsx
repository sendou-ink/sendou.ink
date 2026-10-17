/** Displays user-authored markdown already rendered to sanitized HTML on the server by `MarkdownHtml.render` */
export function Markdown({
	html,
	className,
}: {
	html: string;
	className?: string;
}) {
	return (
		<div className={className} dangerouslySetInnerHTML={{ __html: html }} />
	);
}

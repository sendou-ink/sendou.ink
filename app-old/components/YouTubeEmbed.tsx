export function YouTubeEmbed({
	id,
	start,
	autoplay = false,
}: {
	id: string;
	start?: number;
	autoplay?: boolean;
}) {
	return (
		<div className="youtube__container">
			<iframe
				className="youtube__iframe"
				src={`https://www.youtube.com/embed/${id}?autoplay=${
					autoplay ? "1" : "0"
				}&controls=1&rel=0&modestbranding=1&start=${start ?? 0}`}
				frameBorder="0"
				allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
				allowFullScreen
				title="Embedded youtube"
			/>
		</div>
	);
}

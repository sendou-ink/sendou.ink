export const loader = () => {
	return new Response("OK", {
		headers: {
			"Content-Type": "text/plain",
			"Cache-Control": "no-store",
		},
	});
};

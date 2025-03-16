import * as React from "react";

/** Forces the component to rerender periodically*/
export function useAutoRerender(every?: "second" | "ten seconds") {
	const [, setNow] = React.useState(new Date().getTime());

	React.useEffect(() => {
		const intervalTime = !every || every === "second" ? 1000 : 10000;

		const interval = setInterval(() => {
			setNow(new Date().getTime());
		}, intervalTime);

		return () => {
			clearInterval(interval);
		};
	}, [every]);
}

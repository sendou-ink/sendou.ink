import { useLocation } from "@remix-run/react";
import { useEffect, useState } from "react";
import { logger } from "../../utils/logger";

declare global {
	interface Window {
		ramp: any;
	}
}

const PUBLISHER_ID = import.meta.env.VITE_PLAYWIRE_PUBLISHER_ID;
const WEBSITE_ID = import.meta.env.VITE_PLAYWIRE_WEBSITE_ID;

export const Ramp = () => {
	const [rampComponentLoaded, setRampComponentLoaded] = useState(false);
	const location = useLocation();

	useEffect(() => {
		if (!PUBLISHER_ID || !WEBSITE_ID) {
			logger.info("RAMP: Missing Publisher Id or Website Id");
			return;
		}

		if (!rampComponentLoaded) {
			logger.info("RAMP: Loading");
			setRampComponentLoaded(true);
			window.ramp = window.ramp || {};
			window.ramp.que = window.ramp.que || [];
			window.ramp.passiveMode = true;

			// Load the Ramp configuration script
			const configScript = document.createElement("script");
			configScript.src = `https://cdn.intergient.com/${PUBLISHER_ID}/${WEBSITE_ID}/ramp.js`;
			document.body.appendChild(configScript);

			configScript.onload = window.ramp.que.push(() => {
				window.ramp.spaNewPage;
			});
		}

		// Cleanup function to handle component unmount and updating page state
		return () => {
			window.ramp.que.push(() => {
				window.ramp.spaNewPage(location.pathname);
			});
		};
	}, [rampComponentLoaded, location.pathname]);

	return null;
};

import { useFetcher } from "@remix-run/react";
import { type ReactNode, useCallback } from "react";
import { createContext, useContext, useEffect, useState } from "react";

enum Theme {
	DARK = "dark",
	LIGHT = "light",
}
const themes: Array<Theme> = Object.values(Theme);

type ThemeContextType = {
	/** The CSS class to attach to the `html` tag */
	htmlThemeClass: Theme | "";
	/** The color scheme to be defined in the meta tag */
	metaColorScheme: "light dark" | "dark light";
	/**
	 * The Theme setting of the user, as displayed in the theme switcher.
	 * `null` means there is no theme switcher (static theme on error pages).
	 */
	userTheme: Theme | "auto" | null;
	/** Persists a new `userTheme` setting */
	setUserTheme: (newTheme: Theme | "auto") => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const prefersLightMQ = "(prefers-color-scheme: light)";
const getPreferredTheme = () =>
	window.matchMedia(prefersLightMQ).matches ? Theme.LIGHT : Theme.DARK;

type ThemeProviderProps = {
	children: ReactNode;
	specifiedTheme: Theme | null;
	themeSource: "user-preference" | "static";
};

function ThemeProvider({
	children,
	specifiedTheme,
	themeSource,
}: ThemeProviderProps) {
	const [[theme, isAutoDetected], setThemeState] = useState<
		[Theme, false] | [Theme | null, true]
	>(() => {
		if (themeSource === "static") {
			return [specifiedTheme ?? Theme.DARK, false];
		}

		if (specifiedTheme) {
			return [specifiedTheme, false];
		}

		/* 
      If we don't know a preferred user theme, we have to auto-detect it.
      Since the server has no way of doing auto-detection, it returns null,
      leading to the `html` class and `color-scheme` values being set to a
      default.
      
      Then, on the client, the `clientThemeCode` will run, correcting those 
      defaults with the determined correct value.
      Which means, when we later render this component again, hydration will
      succeed. Because the output of `getPreferredTheme()` is (very likely) the
      same that the `clientThemeCode` determined and added to the html element
      shortly before.
    */

		return [typeof document === "undefined" ? null : getPreferredTheme(), true];
	});

	const persistThemeFetcher = useFetcher();
	const persistTheme = persistThemeFetcher.submit;

	// biome-ignore lint/correctness/useExhaustiveDependencies: biome migration
	const setUserTheme = useCallback(
		(newTheme: Theme | "auto") => {
			setThemeState(
				newTheme === "auto" ? [getPreferredTheme(), true] : [newTheme, false],
			);
			persistTheme(
				{ theme: newTheme },
				{
					action: "theme",
					method: "post",
				},
			);
		},
		[setThemeState, persistTheme],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: biome migration
	useEffect(() => {
		if (!isAutoDetected) {
			return;
		}

		const mediaQuery = window.matchMedia(prefersLightMQ);
		const handleChange = () => {
			setThemeState([mediaQuery.matches ? Theme.LIGHT : Theme.DARK, true]);
		};
		mediaQuery.addEventListener("change", handleChange);
		return () => mediaQuery.removeEventListener("change", handleChange);
	}, [isAutoDetected]);

	return (
		<ThemeContext.Provider
			value={{
				// Gets corrected by clientThemeCode if set to "" during SSR
				htmlThemeClass: theme ?? "",
				// Gets corrected by clientThemeCode if set to wrong value during SSR
				metaColorScheme: theme === Theme.LIGHT ? "light dark" : "dark light",
				userTheme:
					themeSource === "static" ? null : isAutoDetected ? "auto" : theme,
				setUserTheme,
			}}
		>
			{children}
		</ThemeContext.Provider>
	);
}

// this is how I make certain we avoid a flash of the wrong theme. If you select
// a theme, then I'll know what you want in the future and you'll not see this
// script anymore.
const clientThemeCode = `
;(() => {
  const theme = window.matchMedia(${JSON.stringify(prefersLightMQ)}).matches
    ? 'light'
    : 'dark';
  const cl = document.documentElement.classList;
  const themeAlreadyApplied = cl.contains('light') || cl.contains('dark');
  if (themeAlreadyApplied) {
    console.warn(
      "Script is running but theme is already applied",
    );
  } else {
    cl.add(theme);
  }
  const meta = document.querySelector('meta[name=color-scheme]');
  if (meta) {
    if (theme === 'dark') {
      meta.content = 'dark light';
    } else if (theme === 'light') {
      meta.content = 'light dark';
    }
  } else {
    console.warn(
      "No meta tag",
    );
  }
})();
`;

function ThemeHead() {
	const { userTheme, metaColorScheme } = useTheme();
	const [initialUserTheme] = useState(userTheme);

	return (
		<>
			{/*
        On the server, "theme" might be `null`, so clientThemeCode ensures that
        this is correct before hydration.
      */}
			<meta name="color-scheme" content={metaColorScheme} />
			{/*
        If we know what the theme is from user preference, then we don't need 
        to do fancy tricks prior to hydration to make things match.
      */}
			{initialUserTheme === "auto" && (
				<script
					// NOTE: we cannot use type="module" because that automatically makes
					// the script "defer". That doesn't work for us because we need
					// this script to run synchronously before the rest of the document
					// is finished loading.
					// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted source
					dangerouslySetInnerHTML={{ __html: clientThemeCode }}
				/>
			)}
		</>
	);
}

function useTheme() {
	const context = useContext(ThemeContext);
	if (context === undefined) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
}

function isTheme(value: unknown): value is Theme {
	return typeof value === "string" && themes.includes(value as Theme);
}

export { isTheme, Theme, ThemeHead, ThemeProvider, useTheme };

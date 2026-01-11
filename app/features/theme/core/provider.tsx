import {
	createContext,
	type ReactNode,
	useContext,
	useState,
	useSyncExternalStore,
} from "react";
import { useFetcher } from "react-router";

const Theme = {
	DARK: "dark",
	LIGHT: "light",
} as const;
type Theme = (typeof Theme)[keyof typeof Theme];
const themes = Object.values(Theme);

type ThemeContextType = {
	htmlThemeClass: Theme;
	metaColorScheme: "light dark" | "dark light";
	userTheme: Theme | "auto" | null;
	setUserTheme: (newTheme: Theme | "auto") => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const PREFERS_LIGHT_MQ = "(prefers-color-scheme: light)";

function getSystemTheme() {
	return window.matchMedia(PREFERS_LIGHT_MQ).matches ? Theme.LIGHT : Theme.DARK;
}

function subscribeToSystemTheme(callback: () => void) {
	const mediaQuery = window.matchMedia(PREFERS_LIGHT_MQ);
	mediaQuery.addEventListener("change", callback);
	return () => mediaQuery.removeEventListener("change", callback);
}

function useSystemTheme() {
	return useSyncExternalStore(
		subscribeToSystemTheme,
		getSystemTheme,
		() => Theme.DARK,
	);
}

type ThemeProviderProps = {
	children: ReactNode;
	specifiedTheme: Theme | null;
	themeSource: "user-preference" | "static";
};

function colorScheme(theme: Theme) {
	return theme === Theme.LIGHT ? "light dark" : "dark light";
}

function ThemeProvider({
	children,
	specifiedTheme,
	themeSource,
}: ThemeProviderProps) {
	const isStatic = themeSource === "static";
	const [userPreference, setUserPreference] = useState<Theme | "auto">(
		isStatic ? (specifiedTheme ?? Theme.DARK) : (specifiedTheme ?? "auto"),
	);

	const systemTheme = useSystemTheme();
	const persistThemeFetcher = useFetcher();

	const resolvedTheme = isStatic
		? (specifiedTheme ?? Theme.DARK)
		: userPreference === "auto"
			? systemTheme
			: userPreference;

	const handleSetUserTheme = (newTheme: Theme | "auto") => {
		setUserPreference(newTheme);
		persistThemeFetcher.submit(
			{ theme: newTheme },
			{ action: "theme", method: "post" },
		);
	};

	return (
		<ThemeContext.Provider
			value={{
				htmlThemeClass: resolvedTheme,
				metaColorScheme: colorScheme(resolvedTheme),
				userTheme: isStatic ? null : userPreference,
				setUserTheme: handleSetUserTheme,
			}}
		>
			{children}
		</ThemeContext.Provider>
	);
}

const CLIENT_THEME_SCRIPT = `
;(() => {
  const theme = window.matchMedia(${JSON.stringify(PREFERS_LIGHT_MQ)}).matches
    ? 'light'
    : 'dark';
  const cl = document.documentElement.classList;
  const themeAlreadyApplied = cl.contains('light') || cl.contains('dark');
  if (!themeAlreadyApplied) {
    cl.add(theme);
  }
  const meta = document.querySelector('meta[name=color-scheme]');
  if (meta) {
    meta.content = theme === 'dark' ? 'dark light' : 'light dark';
  }
})();
`;

function ThemeHead() {
	const { userTheme, metaColorScheme } = useTheme();
	const [initialUserTheme] = useState(userTheme);

	return (
		<>
			<meta name="color-scheme" content={metaColorScheme} />
			{initialUserTheme === "auto" ? (
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted source
					dangerouslySetInnerHTML={{ __html: CLIENT_THEME_SCRIPT }}
				/>
			) : null}
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

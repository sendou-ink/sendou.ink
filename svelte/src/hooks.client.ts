import { type Locale, overwriteGetLocale } from "#lib/paraglide/runtime.js";

// the server picks the locale (cookie, then Accept-Language) and renders it to <html lang>
overwriteGetLocale(() => document.documentElement.lang as Locale);

import { afterEach, expect } from "bun:test";
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { config } from "~/modules/i18n/config";
import { resources } from "~/modules/i18n/resources.browser";

expect.extend(matchers);

afterEach(() => {
	cleanup();
});

document.documentElement.classList.add("dark");

await i18next.use(initReactI18next).init({
	...config,
	lng: "en",
	resources,
});

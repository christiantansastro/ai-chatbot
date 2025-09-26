import { generateDummyPassword } from "./db/utils";

export const isProductionEnvironment = process.env.NODE_ENV === "production";
export const isDevelopmentEnvironment = process.env.NODE_ENV === "development";
export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    (process.env.PLAYWRIGHT && !['false', 'False', 'FALSE', '0', 'no', 'No', 'NO'].includes(process.env.PLAYWRIGHT)) ||
    process.env.CI_PLAYWRIGHT
);

console.log('Environment check:', {
  PLAYWRIGHT_TEST_BASE_URL: process.env.PLAYWRIGHT_TEST_BASE_URL,
  PLAYWRIGHT: process.env.PLAYWRIGHT,
  CI_PLAYWRIGHT: process.env.CI_PLAYWRIGHT,
  isTestEnvironment,
  NODE_ENV: process.env.NODE_ENV
});

export const guestRegex = /^guest-\d+$/;

export const DUMMY_PASSWORD = generateDummyPassword();

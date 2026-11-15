import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  eslintConfigPrettier,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-non-null-assertion": "warn",
    },
  },
  {
    // Plain-JS Node scripts (e.g. scripts/smoke-dist.mjs) are outside the
    // TypeScript project: lint them without type information.
    files: ["**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        // Referenced inside callbacks Playwright runs in the page.
        window: "readonly",
      },
    },
  },
  {
    // The browser smoke page / worker have their own DOM-typed project.
    files: ["test/browser/**/*.ts"],
    languageOptions: {
      parserOptions: { project: "./test/browser/tsconfig.json" },
    },
  },
  {
    ignores: ["dist/", "node_modules/", "src/generated/", "coverage/", "*.config.*"],
  },
);

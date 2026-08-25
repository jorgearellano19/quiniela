import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "max-len": [
        "error",
        {
          code: 100,
          ignoreComments: false,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreUrls: true,
        },
      ],
    },
  },
  globalIgnores([".next/**", ".codex/worktrees/**", "drizzle/**", "next-env.d.ts"]),
]);

import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginVue from "eslint-plugin-vue";


export default [
	{
		files: ["src/**/*.{js,mjs,cjs,ts,vue}"]
	},
	{
		languageOptions: {
			globals: globals.browser
		}
	},
	pluginJs.configs.recommended,
	...tseslint.configs.recommended,
	...pluginVue.configs["flat/essential"],
	{
		files: ["**/*.vue"],
		languageOptions: {
			parserOptions: {
				parser: tseslint.parser
			}
		}
	},
	{
		rules: {
			"@typescript-eslint/naming-convention": [
				"error",
				{
					"selector": "default",
					"format": ["snake_case"]
				},
				{
					"selector": "typeLike",
					"format": ["PascalCase"],
					"leadingUnderscore": "forbid",
					"trailingUnderscore": "forbid"
				},
				{
					"selector": "enumMember",
					"format": ["PascalCase"],
					"leadingUnderscore": "forbid",
					"trailingUnderscore": "forbid"
				},
				{
					"selector": "import",
					"format": ["PascalCase", "snake_case", "camelCase"],
					"leadingUnderscore": "forbid",
					"trailingUnderscore": "forbid"
				}
			],
			"vue/no-use-v-if-with-v-for": "off",
			"vue/script-indent": ["error", "tab", {
				"baseIndent": 1,
				"switchCase": 1,
				"ignores": []
			}]
		}
	},
	{
		ignores: [
			"build/*.js",
			"build/*.cjs",
			"dist/*",
			"eslint.config.js",
			"vite.config.ts"
		]
	},
];
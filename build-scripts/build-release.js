const esbuild = require("esbuild");

esbuild.build({
	entryPoints: ["./build-scripts/release.ts"],
	outfile: "./build-scripts/release.js",
	tsconfig: "./build-scripts/tsconfig.json",
	platform: "node",
	bundle: true
});
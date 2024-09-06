const esbuild = require("esbuild");

if (process.argv.length !== 3 || !["debug", "release"].includes(process.argv[2])) {
	process.exit(1);
}

const esbuild_settings = {
	entryPoints: ["src/setup/setup.ts"],
	tsconfig: "src/setup/tsconfig.json",
	platform: "node",
	bundle: true,
	external: [
		"bcrypt"
	]
};

if (process.argv[2] === "debug") {
	esbuild_settings.outdir = "out/setup";
	esbuild_settings.sourcemap = true
} else {
	esbuild_settings.outdir = "dist/build";
	esbuild_settings.minify = true;
}

esbuild.build(esbuild_settings);

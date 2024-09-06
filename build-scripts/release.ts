import archiver from "archiver";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const exec_map: Partial<Record<NodeJS.Platform, string>> = {
	"win32": "node.exe",
	"linux": "node"
};
let exec_name: string;
// check, wether the build script supports the os
if (!(process.platform in exec_map)) {
	console.error("Buildscript does not support this OS");
	process.exit(1);
} else {
	exec_name = exec_map[process.platform] as string;
}

// load the package.json
// eslint-disable-next-line @typescript-eslint/naming-convention
const package_json = JSON.parse(fs.readFileSync("package.json", "utf-8")) as { version: string; dependencies: Record<string, string>; extDependencies: string[]; name: string; };

console.log(`Building ${package_json.name} release`);
console.log();

const build_name = `${package_json.name}_${package_json.version}_${process.platform}`;
console.log(`Building for target '${build_name}'`);

const build_dir = "dist/build";
const release_dir = path.join("dist", build_name);

console.log(`Build directory is '${build_dir}'`);
console.log(`Release directory is '${release_dir}'`);
console.log();

// clear the build- and release-directory
console.log("Removing build directory");
fs.rmSync(build_dir, { recursive: true, force: true });

if (fs.existsSync(release_dir)) {
	console.log("Removing release directory");
	fs.rmSync(release_dir, { recursive: true, force: true });
}

console.log("Creating building directory");
fs.mkdirSync(build_dir, { recursive: true });

console.log("Creating empty release directory");
fs.mkdirSync(release_dir, { recursive: true });

console.log();

// helper-functions
const copy_build_file = (file: string, dest?: string) => fs.copyFileSync(file, path.join(build_dir, dest ?? path.basename(file)));
// const copy_build_dir = (dir: string, dest?: string, args?: fs.CopySyncOptions) => fs.cpSync(dir, path.join(build_dir, dest ?? path.basename(dir)), { recursive: true, ...args });
const copy_release_file = (file: string, dest?: string) => fs.copyFileSync(file, path.join(release_dir, dest ?? path.basename(file)));
const copy_release_dir = (dir: string, dest?: string, args?: fs.CopySyncOptions) => fs.cpSync(dir, path.join(release_dir, dest ?? path.basename(dir)), { recursive: true, ...args });
const copy_module = (name: string) => {
	console.log(`\t\t${name}`);
	copy_release_dir(`node_modules/${name}`, `node_modules/${name}/`);
};

// bundle the different scripts
console.log("Building server");
execSync("npm run build");

console.log("Building setup");
execSync("npm run setup-build");

// temporary method until there is a solution for packaging sharp
// // create sea-prep.blob
// execSync("node --experimental-sea-config sea-config.json");

// get the node executable
console.log(`Copying node executable to '${build_dir}'`);
copy_build_file(process.execPath, exec_name);

// temporary method until there is a solution for packaging sharp
// // remove the signature from the node executable
// execSync(`'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.22621.0\\x64\\signtool.exe' remove /s dist/build/${exec_name}`);
// // modify the node executable
// execSync(`npx postject dist/build/${exec_name} NODE_SEA_BLOB dist/build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`);

console.log();
console.log(`Copying files to '${release_dir}'`);

console.log(`\tCopying 'config_default.yaml' to '${path.join(release_dir, "config.yaml")}'`);
copy_release_dir("config_default.yaml", "config.yaml");

// copy the file to the output
console.log(`\tCopying node executable`);
copy_release_file(path.join(build_dir, exec_name));

console.log(`\tCopying server-script '${path.join(build_dir, "server.js")}'`);
copy_release_file(path.join(build_dir, "server.js"));

console.log(`\tCopying setup-script '${path.join(build_dir, "setup.js")}'`);
copy_release_file(path.join(build_dir, "setup.js"));

console.log("\tCopying external node-modules");

package_json.extDependencies.forEach((module) => copy_module(module));

console.log();

// temporary method until there is a solution for packaging sharp
// create a script-file, that start node with the main.js
console.log("Creating startup-script for the server");
create_launch_script("server.js", "server");

console.log("Creating startup-script for the setup");
create_launch_script("setup.js", "setup");

// create and copy the licenses
console.log("Creating node-module licence-report");
try {
	execSync("npx license-reporter --config build-scripts/license-reporter.config.ts");
} catch { /* empty */ }

// eslint-disable-next-line @typescript-eslint/naming-convention
interface License { name: string; licenseText: string }

console.log("Loading licence-report");
const licenses_orig = JSON.parse(fs.readFileSync("build-scripts/3rdpartylicenses.json", "utf-8")) as License[];

const licenses: Record<string, License> = {};

licenses_orig.forEach((pack) => {
	licenses[pack.name] = pack;
});

console.log("Creating licence-directory");
fs.mkdirSync("dist/build/licenses");

console.log("Writing licences");
Object.keys(package_json.dependencies).forEach((pack) => {
	const lic = licenses[pack];

	console.log(`\t'${lic.name}'`);

	try {
		fs.writeFileSync(`dist/build/licenses/${lic.name}.txt`, lic.licenseText, "utf-8");
	} catch {
		if (lic.licenseText === undefined) {
			throw new EvalError(`ERROR: no license was found for the package '${lic.name}'`);
		}
	}
});

console.log(`Writing ${package_json.name}-licene`)
copy_release_file("LICENSE", "LICENSE.txt");

// copy the licenses
console.log(`Copying licences to '${release_dir}'`);
copy_release_dir(path.join(build_dir, "licenses"));

console.log();

// pack the files
console.log(`Packing release to '${release_dir}.zip'`);
const zip_stream = fs.createWriteStream(release_dir + ".zip");

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
const archive = archiver("zip");

archive.pipe(zip_stream);

archive.directory(release_dir, false);

void archive.finalize();
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

function create_launch_script(pth: string, destination: string) {
	const relative_path_prefix = "../".repeat((destination.match(/\//g) ?? []).length);

	switch (process.platform) {
		case "win32": {
				fs.writeFileSync(path.join(release_dir, destination + ".bat"), `@echo off\ncd /D "%~dp0"\n${relative_path_prefix.replaceAll("/", "\\")}${exec_name} ${pth}\npause\n`);
			}
			break;
		case "linux":
			fs.writeFileSync(
				path.join(release_dir, destination + ".sh"),
				`${relative_path_prefix}./${exec_name} ${pth}\nread -n1 -r -p "Press any key to continue..." key`
			);
			break;
	}
}
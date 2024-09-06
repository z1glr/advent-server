import { IReporterConfiguration } from "@weichwarenprojekt/license-reporter";

export const configuration: Partial<IReporterConfiguration> = {
	// defaultLicenseText: undefined,
    output: "build-scripts/3rdpartylicenses.json",
	ignore: ["dist/*"],
    overrides: []
};
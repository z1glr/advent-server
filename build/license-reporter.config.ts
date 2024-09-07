import { IReporterConfiguration } from "@weichwarenprojekt/license-reporter";

export const configuration: Partial<IReporterConfiguration> = {
	// defaultLicenseText: undefined,
    output: "build/3rdpartylicenses.json",
	ignore: ["dist/*"],
    overrides: []
};
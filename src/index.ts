import * as core from "@actions/core";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

type VersionType = "release" | "beta" | "alpha";

type Dependency = {
    version_id?: string | null;
    project_id?: string | null;
    file_name?: string | null;
    dependency_type: "required" | "optional" | "incompatible" | "embedded";
};

type VersionUploadRequest = {
    name: string;
    version_number: string;
    changelog: string;
    dependencies: Dependency[];
    game_versions: string[];
    version_type: VersionType;
    loaders: string[];
    featured: boolean;
    project_id: string;
    file_parts: string[];
    primary_file?: string;
};

type ModrinthVersionResponse = Record<string, unknown>;

const VERSION_TYPES = new Set<VersionType>(["release", "beta", "alpha"]);
const DEPENDENCY_TYPES = new Set<Dependency["dependency_type"]>(["required", "optional", "incompatible", "embedded"]);

function getTrimmedInput(name: string, options?: core.InputOptions): string {
    return core.getInput(name, options).trim();
}

function getValidatedInput<T extends string>(name: string, allowedValues: ReadonlySet<T>): T {
    const value = getTrimmedInput(name, { required: true });

    if (!allowedValues.has(value as T)) {
        throw new Error(`Invalid ${name}: ${value}. Expected one of: ${Array.from(allowedValues).join(", ")}`);
    }

    return value as T;
}

function getRequiredMultilineInput(name: string): string[] {
    const values = core.getMultilineInput(name, { required: true }).map(value => value.trim()).filter(Boolean);

    if (values.length === 0) {
        throw new Error(`Input ${name} must contain at least one non-empty value.`);
    }

    return values;
}

function parseDependencies(value: string): Dependency[] {
    const dependencies: unknown = JSON.parse(value);

    if (!Array.isArray(dependencies)) {
        throw new Error("Dependencies must be a JSON array.");
    }

    for (const [index, dependency] of dependencies.entries()) {
        if (typeof dependency !== "object" || dependency === null || Array.isArray(dependency)) {
            throw new Error(`Dependency at index ${index} must be an object.`);
        }

        const dependencyType = (dependency as Partial<Dependency>).dependency_type;

        if (!DEPENDENCY_TYPES.has(dependencyType as Dependency["dependency_type"])) {
            throw new Error(`Dependency at index ${index} must include a valid dependency_type.`);
        }
    }

    return dependencies as Dependency[];
}

async function resolveChangeLog(): Promise<string> {
    const directChangeLog = core.getInput("change_log");
    const pathChangeLog = getTrimmedInput("change_log_path");

    if (directChangeLog.trim().length > 0) {
        return directChangeLog;
    }

    if (pathChangeLog.length > 0) {
        return await readFile(pathChangeLog, "utf8");
    }

    return "";
}

async function resolveDependencies(): Promise<Dependency[]> {
    const directDependencies = getTrimmedInput("dependencies");
    const pathDependencies = getTrimmedInput("dependencies_path");

    if (directDependencies.length > 0) {
        return parseDependencies(directDependencies);
    }

    if (pathDependencies.length > 0) {
        return parseDependencies(await readFile(pathDependencies, "utf8"));
    }

    return [];
}

type UploadFile = {
    partName: string;
    fileName: string;
    buffer: Buffer;
};

async function upload(data: VersionUploadRequest, files: UploadFile[]): Promise<ModrinthVersionResponse> {
    const formData = new FormData();

    formData.set(
        "data",
        new Blob([JSON.stringify(data)], { type: "application/json" })
    );

    for (const file of files) {
        formData.set(
            file.partName,
            new Blob([new Uint8Array(file.buffer)], {
                type: "application/java-archive",
            }),
            file.fileName
        );
    }

    const response = await fetch("https://api.modrinth.com/v2/version", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${getTrimmedInput("token", { required: true })}`,
            "User-Agent": `${process.env.GITHUB_REPOSITORY ?? "unknown/repo"}/action-modrinth-release`,
        },
        body: formData,
    });

    const responseText = await response.text();

    if (!response.ok) {
        throw new Error(`Failed to upload file: ${response.status} ${response.statusText} - ${responseText}`);
    }

    return JSON.parse(responseText) as ModrinthVersionResponse;
}

async function main() {
    try {
        const versionNumber = getTrimmedInput("version_number", { required: true });
        const name = getTrimmedInput("name") || versionNumber;
        const changeLog = await resolveChangeLog();
        const dependencies = await resolveDependencies();
        const gameVersions = getRequiredMultilineInput("game_versions");
        const versionType = getValidatedInput("version_type", VERSION_TYPES);
        const loaders = getRequiredMultilineInput("loaders");
        const projectId = getTrimmedInput("project_id", { required: true });

        const data: VersionUploadRequest = {
            name,
            version_number: versionNumber,
            changelog: changeLog,
            dependencies,
            game_versions: gameVersions,
            version_type: versionType,
            loaders,
            featured: true,
            project_id: projectId,
            file_parts: [],
        };

        console.log("Data:", JSON.stringify(data, null, 2));

        const filesPath = getTrimmedInput("files_path", { required: true });
        const jarFiles = (await readdir(filesPath, { withFileTypes: true }))
            .filter(file => file.isFile() && file.name.endsWith(".jar"))
            .map(file => file.name);

        if (jarFiles.length === 0) {
            core.setFailed("No jar files found in the specified files path.");
            return;
        }

        const uploadFiles: UploadFile[] = [];

        for (const jarFile of jarFiles) {
            const partName = jarFile.replace(/\.jar$/i, "");
            data.file_parts.push(partName);

            uploadFiles.push({
                partName,
                fileName: jarFile,
                buffer: await readFile(join(filesPath, jarFile)),
            });
        }

        data.primary_file = uploadFiles[0]!.partName;

        const result = await upload(data, uploadFiles);
        console.log("Upload result:", JSON.stringify(result, null, 2));
    } catch (error) {
        core.setFailed(`Action failed. ${error instanceof Error ? error.message : String(error)}`);
    }
}

main();

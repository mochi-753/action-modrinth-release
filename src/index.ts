import * as core from "@actions/core";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

type VersionType = "release" | "beta" | "alpha";

const VERSION_TYPES = new Set<VersionType>(["release", "beta", "alpha"]);

function getValidatedInput<T extends string>(name: string, allowedValues: ReadonlySet<T>): T {
    const value = core.getInput(name);

    if (!allowedValues.has(value as T)) {
        throw new Error(`Invalid ${name}: ${value}. Expected one of: ${Array.from(allowedValues).join(", ")}`);
    }

    return value as T;
}

async function resolveChangeLog(): Promise<string> {
    const directChangeLog = core.getInput("change_log");
    const pathChangeLog = core.getInput("change_log_path");

    if (directChangeLog && directChangeLog.trim().length > 0) {
        return directChangeLog;
    }

    if (pathChangeLog && pathChangeLog.trim().length > 0) {
        return await readFile(pathChangeLog, "utf8");
    }

    return "";
}

async function resolveDependencies(): Promise<unknown[]> {
    const directDependencies = core.getInput("dependencies");
    const pathDependencies = core.getInput("dependencies_path");

    if (directDependencies && directDependencies.trim().length > 0) {
        return JSON.parse(directDependencies);
    }

    if (pathDependencies && pathDependencies.trim().length > 0) {
        return JSON.parse(await readFile(pathDependencies, "utf8"));
    }

    return [];
}

type UploadFile = {
    partName: string;
    fileName: string;
    buffer: Buffer;
};

async function upload(data: any, files: UploadFile[]): Promise<any> {
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
            Authorization: `Bearer ${core.getInput("token")}`,
            "User-Agent": `${process.env.GITHUB_REPOSITORY ?? "unknown/repo"}/action-modrinth-release`,
        },
        body: formData,
    });

    const responseText = await response.text();

    if (!response.ok) {
        throw new Error(`Failed to upload file: ${response.status} ${response.statusText} - ${responseText}`);
    }

    return JSON.parse(responseText);
}

async function main() {
    try {
        const name = core.getInput("name");
        const version_number = core.getInput("version_number");
        const changeLog = await resolveChangeLog();
        const dependencies_data = await resolveDependencies();
        const gameVersions = core.getMultilineInput("game_versions");
        const versionType: VersionType = getValidatedInput("version_type", VERSION_TYPES);
        const loaders = core.getMultilineInput("loaders");
        const projectId = core.getInput("project_id");

        const data: any = {
            name,
            version_number,
            changelog: changeLog,
            dependencies: dependencies_data,
            game_versions: gameVersions,
            version_type: versionType,
            loaders,
            featured: true,
            project_id: projectId,
            file_parts: [] as string[],
        };

        console.log("Data:", JSON.stringify(data, null, 2));

        const filesPath = core.getInput("files_path");
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

        data.primary_file = data.file_parts[0];

        const result = await upload(data, uploadFiles);
        console.log("Upload result:", JSON.stringify(result, null, 2));
    } catch (error) {
        core.setFailed(`Action failed. ${error}`);
    }
}

main();
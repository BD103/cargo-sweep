import * as core from "@actions/core";
import * as exec from "@actions/exec";

import * as fs from "fs/promises";
import * as path from "path";
import * as stream from "stream";

// A list of files, relative to the `target` directory, that will never be deleted. For more
// information on the `target` folder's file structure, please see
// <https://doc.rust-lang.org/nightly/nightly-rustc/cargo/core/compiler/layout/index.html>.
const SKIPPED_FILES = [
    // There will only ever be one copy of these files, and they will often be recreated by `cargo`
    // after they are deleted.
    "CACHEDIR.TAG",
    ".rustc_info.json",
];

/**
 * Returns the path to the `target` directory of the current Cargo project.
 */
async function locateTarget(manifestPath: string): Promise<string> {
    // An array of strings, where each string is a line outputted by `cargo locate-project`. Note
    // that `exec.exec()` doesn't guarantee that each written string will be a line (separated by
    // `\n`), so this should be considered a hack and may break in the future.
    const lines: string[] = [];

    const outStream = new stream.Writable({
        write(chunk: Buffer, _encoding, callback) {
            lines.push(chunk.toString("utf-8"));
            callback();
        }
    });

    // Locate the absolute path to `Cargo.toml`.
    await exec.exec(
        "cargo locate-project",
        [
            `--manifest-path=${manifestPath}`,
            "--workspace",
            "--message-format=plain",
            "--color=never",
        ],
        { outStream },
    );

    // Destroy the stream, just in case it wasn't done so already.
    outStream.destroy();

    core.debug(`Executing \`cargo locate-project\` resulted in the following \`stdout\`: ${lines}`);

    // From the path to `Cargo.toml`, return the path to `target`.
    return path.join(lines[1], "../", "target");
}

async function main() {
    const stamp = Number(core.getState("timestamp"));
    core.info(`Using timestamp: ${new Date(stamp)}.`);

    const manifestPath = core.getInput("manifest-path", { required: true });
    core.info(`Locating \`target\` folder from ${manifestPath}.`);

    // Find `target` folder.
    const targetPath = await locateTarget(manifestPath);
    core.info(`Sweeping files from ${targetPath}.`);

    // An array of promises that will be awaited on all at once.
    const operationHandles: Promise<void>[] = [];

    // Iterate recursively over all files in `target`.
    for (const file of await fs.readdir(targetPath, { recursive: true })) {
        const filePath = path.join(targetPath, file);

        operationHandles.push(
            fs.stat(filePath).then(async (stat) => {
                // Skip over folders, since they cannot be deleted with `fs.rm()` and take up a minimal
                // amount of space. Additionally, skip certain whitelisted files where it wouldn't make
                // sense to delete them.
                if (stat.isDirectory() || SKIPPED_FILES.includes(file)) {
                    core.debug(`Skipped ${filePath} because it is a directory or is whitelisted.`);
                    return;
                }

                // If the file's last access time is older than the timestamp, delete it.
                if (stat.atime.getTime() < stamp) {
                    if (core.isDebug()) {
                        core.info(`Deleting ${filePath} with \`atime\` of ${stat.atime}.`);
                    } else {
                        core.info(`Deleting ${filePath}.`);
                    }

                    await fs.rm(filePath);
                } else {
                    core.debug(`Skipped ${filePath} because it was accessed after timestamp.`);
                }
            }));
    }

    await Promise.all(operationHandles);
}

try {
    const failed = core.getState("failed");

    if (failed == "true") {
        throw new Error("Main action failed, skipping post action.");
    }

    main();
} catch (err) {
    core.setFailed(`Action failed with error: ${err}`);
}

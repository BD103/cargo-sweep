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

/**
 * Returns a human-readable version of `bytes`. (Such as "2 MiB", "1.3 KiB", etc.)
 * 
 * This implementation is based off of the answer in <https://stackoverflow.com/a/14919494>. Thank
 * you!
 */
function bytesToHuman(bytes: number): string {
    // Each incrementing unit is 2^10 above the last
    const thresh = 1024;

    // Available units above bytes. The `target` folder should realistically never reach the size
    // of a TiB or greater.
    const units = ["KiB", "MiB", "GiB"];

    // The amount of decimal points that will be outputted.
    const decimalPrecision = 1;

    // 10^decimalPrecision, used when mathematically rounding a number to a certain decimal place.
    const pow10 = 10 ** decimalPrecision;

    // If the number is less than 1 KiB, return it in bytes.
    if (Math.abs(bytes) < thresh) {
        return `${bytes} B`;
    }

    // An increment that indexes into `units`.
    let i = -1;

    // Repeat until `bytes` is below the threshold or there are no more greater units available.
    do {
        bytes /= thresh;
        ++i;
    } while (Math.round(Math.abs(bytes) * pow10) / pow10 >= thresh && i < units.length - 1)

    return `${bytes.toFixed(decimalPrecision)} ${units[i]}`;
}

async function main() {
    const stamp = Number(core.getState("timestamp"));
    core.info(`Using timestamp: ${new Date(stamp)}.`);

    const manifestPath = core.getInput("manifest-path", { required: true });
    core.info(`Locating \`target\` folder from ${manifestPath}.`);

    // Find `target` folder.
    const targetPath = await locateTarget(manifestPath);
    core.info(`Sweeping files from ${targetPath}.`);

    // An array of promises that will be awaited on all at once. These promises return the size of
    // the file that they deleted.
    const operationHandles: Promise<number>[] = [];

    // Iterate recursively over all files in `target`.
    for (const file of await fs.readdir(targetPath, { recursive: true })) {
        const filePath = path.join(targetPath, file);

        operationHandles.push(
            fs.stat(filePath).then(
                // `onFulfilled`, executed when `fs.stat()` succeeds.
                async (stat) => {
                    // Skip over folders, since they cannot be deleted with `fs.rm()` and take up a minimal
                    // amount of space. Additionally, skip certain whitelisted files where it wouldn't make
                    // sense to delete them.
                    if (stat.isDirectory() || SKIPPED_FILES.includes(file)) {
                        core.debug(`Skipped ${filePath} because it is a directory or is whitelisted.`);
                        return 0;
                    }

                    // If the file's last access time is older than the timestamp, delete it.
                    if (stat.atime.getTime() < stamp) {
                        if (core.isDebug()) {
                            core.info(`Deleting ${filePath} with \`atime\` of ${stat.atime}.`);
                        } else {
                            core.info(`Deleting ${filePath}.`);
                        }

                        await fs.rm(filePath);

                        return stat.size;
                    } else {
                        core.debug(`Skipped ${filePath} because it was accessed after timestamp.`);
                        return 0;
                    }
                },
                // `onRejected`, called when `fs.stat()` fails. This is usually due to a bug in
                // NodeJS where `fs.stat()` fails with a permission denied error on Windows.
                // (https://github.com/nodejs/node/issues/35853)
                (error) => {
                    core.info(`Skipped ${filePath} because \`fs.stat()\` failed.`);
                    core.debug(error);

                    return 0;
                },
            ));
    }

    // Await all operations, then sum their returned sizes.
    const bytesDeleted = (await Promise.all(operationHandles))
        .reduce((acc, size) => acc + size, 0);

    core.info(`${bytesToHuman(bytesDeleted)} of unused build artifacts have been cleaned.`);
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

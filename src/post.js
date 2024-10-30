const core = require("@actions/core");
const exec = require("@actions/exec");

const fs = require("fs/promises");
const path = require("path");
const stream = require("stream");

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
 *
 * @returns {string}
 */
async function locateTarget() {
    // An array of strings, where each string is a line outputted by `cargo locate-project`. Note
    // that `exec.exec()` doesn't guarantee that each written string will be a line (separated by
    // `\n`), so this should be considered a hack and may break in the future.
    const lines = [];

    const outStream = new stream.Writable({
        write(chunk, _encoding, callback) {
            lines.push(chunk.toString("utf-8"));
            callback();
        }
    });

    // Locate the absolute path to `Cargo.toml`.
    await exec.exec(
        "cargo locate-project",
        ["--workspace", "--message-format=plain", "--color=never"],
        { outStream },
    );

    // Destroy the stream, just in case it wasn't done so already.
    outStream.destroy();

    // From the path to `Cargo.toml`, return the path to `target`.
    return path.join(lines[1], "../", "target");
}

async function main() {
    const stamp = core.getState("timestamp");
    core.info(`Using timestamp: ${new Date(stamp)}.`);

    // Remove everything older than timestamp.
    core.info("Sweeping unused files.");

    // Find `target` folder.
    const targetPath = await locateTarget();

    // Iterate recursively over all files in `target`.
    for (const file of await fs.readdir(targetPath, { recursive: true })) {
        const filePath = path.join(targetPath, file);
        const stat = await fs.stat(filePath);

        // Skip over folders, since they cannot be deleted with `fs.rm()` and take up a minimal
        // amount of space. Additionally, skip certain whitelisted files where it wouldn't make
        // sense to delete them.
        if (stat.isDirectory() || SKIPPED_FILES.includes(file)) {
            continue;
        }

        // If the file's last access time is older than the timestamp, delete it.
        if (stat.atime.getTime() < stamp) {
            core.info(`Deleting ${filePath}.`);
            await fs.rm(filePath);
        }
    }
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

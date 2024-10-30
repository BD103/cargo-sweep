const core = require("@actions/core");
const exec = require("@actions/exec");

const fs = require("fs/promises");
const path = require("path");
const stream = require("stream");

/**
 * @returns {string}
 */
async function locateTarget() {
    const lines = [];

    const outStream = new stream.Writable({
        write(chunk, _encoding, callback) {
            lines.push(chunk.toString("utf-8"));
            callback();
        }
    });

    await exec.exec(
        "cargo locate-project",
        ["--workspace", "--message-format=plain", "--color=never"],
        { outStream },
    );

    outStream.destroy();

    return path.join(lines[1], "../", "target");
}

async function main() {
    const stamp = core.getState("timestamp");
    core.info(`Using timestamp: ${stamp}.`);

    // Remove everything older than timestamp.
    core.info("Sweeping unused files.");

    // Find `target` folder.
    const targetPath = await locateTarget();

    for (const file of await fs.readdir(targetPath, { recursive: true })) {
        const filePath = path.join(targetPath, file);
        const stat = await fs.stat(filePath);

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

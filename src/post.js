const core = require("@actions/core");
const exec = require("@actions/exec");
const io = require("@actions/io");
const { writeFile } = require("fs/promises");

async function main() {
    // Recreate `sweep.timestamp` file.
    const timestamp = core.getState("timestamp");
    await writeFile("sweep.timestamp", timestamp);
    core.info(`Using timestamp: ${timestamp}.`);

    // Remove everything older than timestamp.
    core.info("Sweeping unused build files.");
    await exec.exec('"target/cargo-sweep/bin/cargo-sweep"', ["sweep", "--file"]);

    // Remove `cargo-sweep` folder so it is not cached.
    await io.rmRF("target/cargo-sweep");
}

try {
    const failed = core.getState("failed");

    if (failed == "true") {
        throw new Error("Main action failed, not running post action.");
    }

    main();
} catch (err) {
    core.setFailed(`Action failed with error: ${err}`);
}

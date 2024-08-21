const cache = require("@actions/cache");
const core = require("@actions/core");
const exec = require("@actions/exec");
const io = require("@actions/io");

const fs = require("fs/promises");

const shared = require("./index");

async function main() {    
    const useCache = core.getBooleanInput("use-cache", { required: false });
    const cacheHit = core.getState("cache-hit");

    // Recreate `sweep.timestamp` file.
    core.info("Restoring timestamp from state.");
    const timestamp = core.getState("timestamp");
    await fs.writeFile("sweep.timestamp", timestamp);

    core.info(`Using timestamp: ${timestamp}.`);

    // Remove everything older than timestamp.
    core.info("Sweeping unused build files.");
    await exec.exec(`"${shared.PATH}"`, ["sweep", "--file"]);

    if (useCache && cacheHit === "false") {
        cache.saveCache(
            [shared.PATH],
            shared.CACHE_KEY,
        )
    }

    // Remove `cargo-sweep` file so it is not cached by anything else.
    core.info("Removing `cargo-sweep`.");
    await io.rmRF(shared.PATH);
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

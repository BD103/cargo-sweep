const cache = require("@actions/cache");
const core = require("@actions/core");
const exec = require("@actions/exec");

const fs = require("fs/promises");

const shared = require("./index");

async function main() {
    try {
        // Check if the `target` folder exists.
        fs.access(`${shared.INPUTS.projectPath}/target`);
    } catch {
        core.info(`Cargo \`target\` directory was not found at ${shared.INPUTS.projectPath}/target.`);

        // Since there's nothing to cache, let's exit early.
        return;
    }

    const cacheHit = core.getState("cache-hit");

    // Recreate `sweep.timestamp` file.
    core.info("Restoring timestamp from state.");
    const timestamp = core.getState("timestamp");
    await fs.writeFile(`${shared.INPUTS.projectPath}/sweep.timestamp`, timestamp);

    core.info(`Using timestamp: ${timestamp}.`);

    // Remove everything older than timestamp.
    core.info("Sweeping unused build files.");
    await exec.exec(`"${shared.PATH}"`, ["sweep", "--file", shared.INPUTS.projectPath]);

    if (shared.INPUTS.useCache && cacheHit === "false") {
        core.info(`Saving cache with key ${shared.cacheKey()}`);

        cache.saveCache(
            [shared.PATH],
            shared.cacheKey(),
        );
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

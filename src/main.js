const core = require("@actions/core");

async function main() {
    // Find the current time since the UNIX epoch.
    const stamp = Date.now();

    core.info(`Creating timestamp at ${new Date(stamp)}.`);
    core.info("All files in the `target` folder not accessed between now and the end of the run will be purged.")

    // Save the timestamp so that it can be accessed in the post step.
    core.saveState("timestamp", stamp);
}

try {
    main();

    core.saveState("failed", "false");
} catch (err) {
    core.setFailed(`Action failed with error: ${err}`);

    // The post action will, by default, always run. This signals that an error occurred and it
    // should not proceed.
    core.saveState("failed", "true");
}

const core = require("@actions/core");

async function main() {
    const stamp = Date.now();
    core.info(`Creating timestamp at ${new Date(stamp)}. All files in the \`target\` folder not accessed between now and the end of the run will be purged.`);
    core.saveState("timestamp", stamp);
}

try {
    main();
    core.saveState("failed", "false");
} catch (err) {
    core.setFailed(`Action failed with error: ${err}`);
    core.saveState("failed", "true");
}

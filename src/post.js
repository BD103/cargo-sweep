const core = require("@actions/core");
const exec = require("@actions/exec");
const io = require("@actions/io");

async function main() {
    // Move timestamp back to current directory.
    await io.mv("target/cargo-sweep/sweep.timestamp", ".");

    // Remove everything older than timestamp.
    core.info("Sweeping unused build files.");
    await exec.exec("cargo", ["sweep", "--file"]);
}

try {
    main();
} catch (err) {
    core.setFailed(`Action failed with error: ${err}`);
}

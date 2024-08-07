const core = require("@actions/core");
const exec = require("@actions/exec");
const io = require("@actions/io");

async function buildCargoSweep() {
    // Force install `cargo-sweep`, opting-in to SemVer-compatible updates from 0.7 upwards.
    await exec.exec("cargo", ["install", "cargo-sweep", "--version", "^0.7.0", "--force"]);
}

function downloadCargoSweep() {
    // TODO
}

/**
 * @param {boolean} usePrebuilt 
 */
async function main(usePrebuilt) {
    if (usePrebuilt) {
        core.startGroup("Downloading pre-built `cargo-sweep`.");
        downloadCargoSweep();
        core.endGroup();
    } else {
        core.startGroup("Building `cargo-sweep` from scratch.");
        await buildCargoSweep();
        core.endGroup();
    }

    // Create timestamp.
    core.info("Creating timestamp.");
    await exec.exec("cargo", ["sweep", "--stamp"]);

    // Move timestamp to `target/cargo-sweep`.
    await io.mkdirP("target/cargo-sweep");
    await io.mv("sweep.timestamp", "target/cargo-sweep");
}

try {
    const usePrebuilt = core.getBooleanInput("use-prebuilt", { required: false });

    main(usePrebuilt);
} catch (err) {
    core.setFailed(`Action failed with error: ${err}`);
}

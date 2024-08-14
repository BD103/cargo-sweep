const artifact = require("@actions/artifact");
const core = require("@actions/core");
const exec = require("@actions/exec");
const github = require("@actions/github");
const io = require("@actions/io");
const os = require("os");
const { readFile, chmod } = require("fs/promises");

async function buildCargoSweep() {
    // Create destination directory.
    await io.mkdirP("target/cargo-sweep/bin");

    // Force install `cargo-sweep`, opting-in to SemVer-compatible updates from 0.7 upwards.
    await exec.exec("cargo", ["install", "cargo-sweep", "--version", "^0.7.0", "--root", "target/cargo-sweep", "--no-track", "--force"]);
}

async function downloadCargoSweep() {
    const ghToken = core.getInput("gh-token", { required: false });
    const octokit = github.getOctokit(ghToken);

    const owner = "BD103";
    const repo = "cargo-sweep";

    // Find artifact name.
    let artifactName;

    switch (os.platform()) {
        case "linux":
            artifactName = "cargo-sweep-linux";
            break;
        case "win32":
            artifactName = "cargo-sweep-windows";
            break;
        case "darwin":
            artifactName = "cargo-sweep-macos";
            break;
        default:
            throw new Error("Run on unsupported platform, prebuilt binaries are not supported.");
    }

    // Find the latest artifact for the given name.
    let { data } = await octokit.rest.actions.listArtifactsForRepo({
        owner,
        repo,
        per_page: 1,
        name: artifactName,
    });

    if (data.artifacts.length < 1 || data.artifacts[0].expired) {
        throw new Error("No prebuilt binaries exist, or they have all expired.");
    }

    const artifactId = data.artifacts[0].id;
    const workflowRunId = data.artifacts[0].workflow_run.id;

    // Create destination directory.
    await io.mkdirP("target/cargo-sweep/bin");

    // Download artifact.
    const client = new artifact.DefaultArtifactClient();
    await client.downloadArtifact(artifactId, {
        path: "target/cargo-sweep/bin",
        findBy: {
            token: ghToken,
            workflowRunId,
            repositoryOwner: owner,
            repositoryName: repo,
        },
    });

    // Make binary executable on Unix.
    switch (os.platform()) {
        case "linux":
        case "darwin":
            await chmod("target/cargo-sweep/bin/cargo-sweep", 0o755);
    }
}

async function main() {
    const usePrebuilt = core.getBooleanInput("use-prebuilt", { required: false });

    if (usePrebuilt) {
        core.startGroup("Downloading pre-built `cargo-sweep`.");
        await downloadCargoSweep();
    } else {
        core.startGroup("Building `cargo-sweep` from scratch.");
        await buildCargoSweep();
    }

    core.endGroup();

    // Create timestamp.
    core.info("Creating timestamp.");
    await exec.exec('"target/cargo-sweep/bin/cargo-sweep"', ["sweep", "--stamp"]);

    // Save contents of `sweep.timestamp` to state, removing the original file.
    const timestamp = (await readFile("sweep.timestamp")).toString();
    core.saveState("timestamp", timestamp);
    await io.rmRF("sweep.timestamp");
}

try {
    main();
} catch (err) {
    core.setFailed(`Action failed with error: ${err}`);
}

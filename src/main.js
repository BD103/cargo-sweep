const artifact = require("@actions/artifact");
const core = require("@actions/core");
const exec = require("@actions/exec");
const github = require("@actions/github");
const io = require("@actions/io");
const os = require("os");
const { readFile, chmod } = require("fs/promises");
const shared = require("./index");

async function buildCargoSweep() {
    // Force install `cargo-sweep`, opting-in to SemVer-compatible updates from 0.7 upwards.
    await exec.exec("cargo", ["install", "cargo-sweep", "--version", shared.VERSION, "--no-track", "--force"]);
}

async function downloadCargoSweep() {
    const ghToken = core.getInput("gh-token", { required: true });
    const octokit = github.getOctokit(ghToken);

    // Find the latest artifact for the given name.
    let { data } = await octokit.rest.actions.listArtifactsForRepo({
        owner: shared.REPO.owner,
        repo: shared.REPO.repo,
        per_page: 1,
        name: shared.artifactName(),
    });

    if (data.artifacts.length < 1 || data.artifacts[0].expired) {
        throw new Error("No prebuilt binaries exist, or they have all expired.");
    }

    const artifactId = data.artifacts[0].id;
    const workflowRunId = data.artifacts[0].workflow_run.id;

    // Download artifact.
    const client = new artifact.DefaultArtifactClient();
    await client.downloadArtifact(artifactId, {
        path: shared.PARENT_PATH,
        findBy: {
            token: ghToken,
            workflowRunId,
            repositoryOwner: shared.REPO.owner,
            repositoryName: shared.REPO.repo,
        },
    });

    // Make binary executable on Unix.
    switch (os.platform()) {
        case "linux":
        case "darwin":
            await chmod(shared.PATH, 0o755);
    }

    process.env["GH_TOKEN"] = ghToken;

    await exec.exec("gh", ["attestation", "verify", shared.PATH, "--repo", `${shared.REPO.owner}/${shared.REPO.repo}`]);
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
    await exec.exec(`"${shared.PATH}"`, ["sweep", "--stamp"]);

    // Save contents of `sweep.timestamp` to state, removing the original file.
    const timestamp = (await readFile("sweep.timestamp")).toString();
    core.saveState("timestamp", timestamp);
    await io.rmRF("sweep.timestamp");
}

try {
    main();
    core.saveState("failed", "false");
} catch (err) {
    core.setFailed(`Action failed with error: ${err}`);
    core.saveState("failed", "true");
}

const artifact = require("@actions/artifact");
const cache = require("@actions/cache");
const core = require("@actions/core");
const exec = require("@actions/exec");
const github = require("@actions/github");
const io = require("@actions/io");

const os = require("os");
const fs = require("fs/promises");

const shared = require("./index");

async function buildCargoSweep() {
    // Force install `cargo-sweep`, opting-in to SemVer-compatible updates from 0.7 upwards.
    await exec.exec("cargo", ["install", "cargo-sweep", "--version", shared.CARGO_SWEEP_VERSION, "--no-track", "--force"]);
}

async function downloadCargoSweep() {
    const ghToken = shared.INPUTS.ghToken;

    // `ghToken` is only required if `use-prebuilt: true`.
    if (ghToken === "") {
        throw new Error("Attempted to download prebuilt `cargo-sweep` without `gh-token` specified.");
    }

    const octokit = github.getOctokit(ghToken);

    // Find the latest artifact for the given name.
    core.info("Fetching latest artifact.");
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
    core.info(`Downloading artifact ${artifactId} from workflow run ${workflowRunId} to ${shared.PARENT_PATH}`);
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
            core.info("Making binary executable on Unix.");
            await fs.chmod(shared.PATH, 0o755);
    }
    
    core.info("Verifying binary integrity using artifact attestations.");
    process.env["GH_TOKEN"] = ghToken;
    await exec.exec("gh", ["attestation", "verify", shared.PATH, "--repo", `${shared.REPO.owner}/${shared.REPO.repo}`]);
    delete process.env["GH_TOKEN"];
}

async function main() {
    let cacheSuccess = undefined;

    if (shared.INPUTS.useCache) {
        core.startGroup("Restoring `cargo-sweep` from cache.");

        cacheSuccess = await cache.restoreCache(
            [shared.PATH],
            shared.CACHE_KEY,
        );

        if (cacheSuccess === undefined) {
            core.saveState("cache-hit", "false");
            core.info(`No cache was found for key ${shared.CACHE_KEY}`);
        } else {
            core.saveState("cache-hit", "true");
            core.info(`Hit cache ${cacheSuccess}.`);
        }

        core.endGroup();
    }

    // If no cache was found or caching is disabled.
    if (cacheSuccess === undefined) {
        if (shared.INPUTS.usePrebuilt) {
            core.startGroup("Downloading pre-built `cargo-sweep`.");
            await downloadCargoSweep();
        } else {
            core.startGroup("Building `cargo-sweep` from scratch.");
            await buildCargoSweep();
        }

        core.endGroup();
    }

    // Create timestamp.
    core.info("Creating timestamp.");
    await exec.exec(`"${shared.PATH}"`, ["sweep", "--stamp"]);

    // Save contents of `sweep.timestamp` to state, removing the original file.
    core.info("Reading timestamp into state and deleting original.");
    const timestamp = (await fs.readFile("sweep.timestamp")).toString();
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

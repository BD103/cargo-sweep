const path = require("path");
const os = require("os");

/**
 * The version of this action, must be kept in sync with releases.
 */
export const ACTION_VERSION = "1.3.0";

/**
 * The version requirement passed to `cargo install` when installing `cargo-sweep`.
 */
export const CARGO_SWEEP_VERSION = "^0.7.0";

/**
 * The repository to download prebuilt `cargo-sweep` artifacts from.
 */
export const REPO = {
    owner: "BD103",
    repo: "cargo-sweep",
};

/**
 * The path to the parent folder of the installed `cargo-sweep`.
 * 
 * This is usually `~/.cargo/bin`.
 */
export const PARENT_PATH = path.join(os.homedir(), ".cargo", "bin");

/**
 * The path to the installed `cargo-sweep`.
 * 
 * This is usually `~/.cargo/bin/cargo-sweep`.
 */
export const PATH = path.join(PARENT_PATH, artifactExe());

/**
 * The primary key to use with the cache.
 */
export const CACHE_KEY = `cargo-sweep-${ACTION_VERSION}-${CARGO_SWEEP_VERSION}`;

/**
 * @returns {string} The name of the artifact to download, depending on the current OS.
 */
export function artifactName() {
    switch (os.platform()) {
        case "linux":
            return "cargo-sweep-linux";
        case "win32":
            return "cargo-sweep-windows";
        case "darwin":
            return "cargo-sweep-macos";
        default:
            throw new Error("Run on unsupported platform, artifact name is not available.");
    }
}

/**
 * @returns {string} The executable name of the artifact to download, depending on the current OS.
 */
export function artifactExe() {
    switch (os.platform()) {
        case "linux":
        case "darwin":
            return "cargo-sweep";
        case "win32":
            return "cargo-sweep.exe";
        default:
            throw new Error("Run on unsupported platform, artifact exe is not available.");
    }
}

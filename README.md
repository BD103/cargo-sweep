# `cargo-sweep` action

This action leverages the power of [`cargo-sweep`](https://github.com/holmgr/cargo-sweep) to clean up stale build files from the `target` directory of a Rust project. Specifically, it uses the timestamp feature to delete unused build artifacts.

## When would you use this?

This is most useful if you cache the `target` directory and use `restore-keys` to fallback on old caches. In these specific examples, old artifacts tend to pile up over time, causing caches to grow to gigabytes in size. You can use `cargo-sweep` to prune these old artifacts while keeping the used ones.

## Quickstart

```yml
- name: Install Rust
  uses: dtolnay/rust-toolchain@stable

# Make sure to restore your cache before calling `cargo-sweep`.
- name: Cache build files
  uses: Leafwing-Studios/cargo-cache@v2

- name: Sweep cache for stale files
  uses: BD103/cargo-sweep@v1

# Any artifacts used between `cargo-sweep` and the end of the job will be kept, the rest will be
# discarded.
- run: cargo build
```

## Caching

This action, by default, caches the `cargo-sweep` binary so it does not need to build / download it again. You can disable this by setting `use-cache: false` in the inputs. Caching greatly speeds up the time of subsequent runs that do not use prebuilt binaries, but has little affect otherwise.

## Prebuilt binaries

This repository automatically builds and hosts binaries of `cargo-sweep`, which you can inspect in [`build-cargo-sweep.yml`](.github/workflows/build-cargo-sweep.yml). You can opt-in to downloading these binaries by setting `use-prebuilt: true`, which may drastically speed up runtimes compared to a clean `cargo install`. These binaries are built weekly for `ubuntu-latest`, `windows-latest`, and `macos-latest`, so you may not be able to use them on other platforms.

This was originally introduced when caching was not implemented, but as of [v1.3] it has much less benefit. If your project is constantly running past Github's cache quota then you may want to enable prebuilt binaries, but in all other cases it is safer and nearly as fast to use caching instead.

[v1.3]: https://github.com/BD103/cargo-sweep/releases/tag/v1.3.0

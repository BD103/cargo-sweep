# `cargo-sweep` action

This action cleans up stale build files from the `target` directory of Rust projects. It can be used to delete files that are never accessed between when this action runs and the end of the job.

> [!NOTE]
>
> This action originally leveraged [`cargo-sweep`](https://github.com/holmgr/cargo-sweep) to
> implement its logic, but has since transitioned to a faster, pure-Javascript approach. The name
> has been kept for historical reasons, but `cargo-sweep` is no longer installed when running this
> action.

## When would you use this?

This is most useful if you cache the `target` directory and use `restore-keys` to fallback on old caches. In these specific examples, old artifacts tend to pile up over time, causing caches to grow to gigabytes in size. You can use `cargo-sweep` to prune these old artifacts while keeping the current ones.

## Quickstart

```yml
- name: Install Rust
  uses: dtolnay/rust-toolchain@stable

# Make sure to restore your cache before calling `cargo-sweep`.
- name: Cache build files
  uses: actions/cache@v4
  with:
    # You probably want to cache more files and use a more-detailed key. This is kept short for
    # brevity's sake.
    path: target
    key: my-job-${{ runner.os }}-${{ hashFiles('**/Cargo.lock') }}
    # `cargo-sweep` is only useful if you use restore keys.
    restore-keys: my-job-${{ runner.os }}-

- name: Sweep cache for stale files
  uses: BD103/cargo-sweep@v2

# Any artifacts used between `cargo-sweep` and the end of the job will be kept, the rest will be
# discarded.
- run: cargo build
```

> [!TIP]
>
> For an all-in-one caching and sweeping solution, I highly recommend [Leafwing-Studios/cargo-cache](https://github.com/Leafwing-Studios/cargo-cache), which integrates with this action directly!

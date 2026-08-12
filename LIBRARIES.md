# Libraries

Vendored dependencies, pinned so a clean clone builds without network access to a
package manager or a floating submodule.

| Library | Path | Pin |
| --- | --- | --- |
| forge-std | `packages/guard/lib/forge-std` | `37712f0e6a59a07dd75e40f558d4451b1a83e829` |

forge-std is vendored as plain files (not a git submodule) on purpose: `forge test` in
`packages/guard` then works from a plain clone with no submodule init step. To update,
run `forge install --no-git foundry-rs/forge-std` from `packages/guard`, delete the
`.git` directory it leaves behind, and bump the pin above.

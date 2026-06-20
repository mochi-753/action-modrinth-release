# Action Modrinth Release

A GitHub Action for uploading Minecraft mod/plugin versions to Modrinth via the Modrinth v2 API.

---

## Features

- Modrinth v2 API support
- Multiple `.jar` file uploads
- Changelog via file or direct input
- Dependency JSON support
- Game versions and loaders support
- Release / beta / alpha support

---

## Usage

```yaml
- name: Upload Modrinth Release
  uses: your-org/modrinth-release-action@v1
  with:
    token: ${{ secrets.MODRINTH_TOKEN }}
    project_id: your_project_id
    version_number: 1.0.0
    name: My Mod 1.0.0
    files_path: artifacts
    game_versions: |
      1.21.1
    loaders: |
      neoforge
    version_type: release
```

---

## Inputs

### Required

| Name           | Description                       |
|----------------|-----------------------------------|
| token          | Modrinth API token                |
| project_id     | Target Modrinth project ID        |
| version_number | Version identifier                |
| files_path     | Directory containing `.jar` files |
| game_versions  | Supported Minecraft versions      |
| loaders        | Mod loaders (fabric / neoforge etc) |

---

### Optional

| Name              | Description                                         |
|-------------------|-----------------------------------------------------|
| name              | Release name                                        |
| change_log        | Changelog text                                      |
| change_log_path   | Path to changelog file                              |
| version_type      | `release` \| `beta` \| `alpha` (default: `release`) |
| dependencies      | JSON dependencies                                   |
| dependencies_path | Path to dependencies JSON                           |

If `name` is omitted, the action uses `version_number` as the Modrinth release name. The `dependencies` input and `dependencies_path` file must contain a JSON array of Modrinth dependency objects.

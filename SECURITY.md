# Security Policy

## Supported versions

The current main branch and 0.1.x are supported. Older development snapshots
have no separate maintenance branch.

## Reporting a vulnerability

Use [private vulnerability reporting](https://github.com/aa-blinov/shityo/security/advisories/new).
Include affected files, reproduction steps and the impact. Do not include real
client measurements or secrets in public issues.

## Scope

The exposed surfaces are FastAPI request validation, geometry/export resource
usage, the Node proxy, project JSON import and the dependency tree. The default
launcher binds to loopback. The application has no authentication or cloud
storage; it is currently a local, single-user workflow.

Browser storage is not encrypted. Exported project JSON contains the entered
measurements and project name. Publisher images are requested from their own
servers, with the source visible in each catalog record.

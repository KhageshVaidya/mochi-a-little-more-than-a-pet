# Local configuration

`demo-identities.local.json` (git-ignored, never packaged, never loaded by smoke tests) can override the
display names, initials, roles and companions of the five demonstration profiles (internal ids CM-01…CM-05)
on a developer's own machine. Public builds always use the original fictional crew and original companions.

```json
{ "profiles": { "CM-01": { "name": "Ada", "initials": "A", "role": "Commander", "companion": "mochi" } } }
```

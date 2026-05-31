# World Cup 2026 Figurine Generation

Prompts and tooling for generating World Cup 2026 country figurines with fal Nano Banana Pro.

## Layout

- `worldcup48_figurine_prompts_v3.md` — current missing/regen prompts only (42 entries)
- `worldcup48_figurine_prompts_v3_full.md` — archived full 96-prompt set
- `cleanup/` — accepted finals as `{Country}_M.png` or `{Country}_F.png`
- `cleanup/alternate/` — rejected variants (`_cartoony`, `_suarez`, etc.)
- `cleanup/candidates/` — new API candidate outputs (`{Country}_M_01.png`, etc.)

## Current batch

- **42 prompts** to generate
- **84 images** at 2 candidates per prompt (~$12.60 at $0.15/image)

Rebuild the missing prompt file after manual cleanup:

```sh
node scripts/build_missing_prompts.mjs
```

## Setup

```sh
# Key is loaded automatically from .env in the project root
node scripts/generate_worldcup_figurines.mjs
```

Or export manually:

```sh
export FAL_KEY="your_fal_key_here"
```

## Generate

Dry run:

```sh
node scripts/generate_worldcup_figurines.mjs --dry-run
```

Generate all missing prompts (2 candidates each):

```sh
node scripts/generate_worldcup_figurines.mjs
```

Generate one country:

```sh
node scripts/generate_worldcup_figurines.mjs --only "Norway:Male"
```

Force regenerate even if a final exists:

```sh
node scripts/generate_worldcup_figurines.mjs --only "Portugal:Male" --force
```

# natejsimonsen.com

A small static site: one page about me, plus a blog built from Markdown.

## Write a post

Add a `.md` file to `posts/` and push to `main` (or use "Add file → Upload files" on GitHub). The site rebuilds and the post appears in the list and the feed.

Front matter is optional:

```md
---
title: My post
date: 2026-11-18
description: One line for the list and link previews.
draft: true
---
```

Without it, the title comes from the first `# heading` (or the file name), the date from a `2026-11-18-` file name prefix (or the file's first commit), and the description from the first paragraph. Drafts only show up locally.

Put images in `public/img/` and link them as `/img/name.png`.

## Edit the rest

- `content/site.json`: name, tagline, projects, contact links.
- `content/about.md`: the About section.
- `src/style.css`: colors and type. Light and dark follow the system setting; the header toggle overrides it.
- `src/garden3d.js`: the 3D background (three.js): a raked-sand garden on a rock floating in space, with a small gardener who plants trees. Trees are saved in the visitor's browser per page.
- `src/art.mjs`: the small SVG marks (post ripples, the seal).

## Run it

`npm install`, then `npm run dev` for a preview at http://localhost:4321 that rebuilds on save.

## Credits

The 3D models in `public/models` are from [Poly Haven](https://polyhaven.com), released under CC0 (public domain): Boulder 01 (the island), Rock Moss Set 01 (the garden stones) and Jacaranda Tree. They were shrunk with gltf-transform (fewer triangles, smaller compressed textures). The tree needed two extra steps, kept in `tools/`: `alpha.mjs` merges its leaf cut-out mask into the leaf texture, and `tree.mjs` thins the foliage by keeping a fraction of whole leaves.

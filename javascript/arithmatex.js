// mkdocs.yml's extra_javascript list references this file to wire up KaTeX
// rendering for pymdownx.arithmatex (generic mode) -- it never existed in
// the upstream template, which made every page 404 on it.
//
// No docs page currently uses math notation ($...$ / $$...$$), so this is
// a no-op stub rather than full KaTeX auto-render wiring. If math notation
// is ever added to a docs page, implement the render call here (and add
// KaTeX's auto-render script, not just its core, to extra_javascript in
// mkdocs.yml) -- see https://squidfunk.github.io/mkdocs-material/reference/math/
// for the exact snippet.

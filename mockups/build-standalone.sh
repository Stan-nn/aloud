#!/bin/sh
# index.html is the Artifact source: a fragment, since the Artifact host supplies
# <!doctype>, <head> and <body>. This wraps it into a file you can double-click.
{
  printf '%s\n' '<!doctype html>' '<html lang="en">' '<head>' \
    '<meta charset="utf-8">' \
    '<meta name="viewport" content="width=device-width,initial-scale=1">' \
    '<style>html{color-scheme:light dark}body{margin:0}img{max-width:100%}</style>' \
    '</head>' '<body>'
  cat index.html
  printf '%s\n' '</body>' '</html>'
} > aloud-mockups.html

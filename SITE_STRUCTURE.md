# LocalFile Toolkit structure

The recommended deployment is one domain with five product portals:

- `/ledgerlift/`
- `/pixelport/`
- `/contactcraft/`
- `/calendarflow/`
- `/captionshift/`

This makes navigation seamless and keeps relative product links working. Each portal can still be moved to its own domain later. If separate domains are used, replace the `../product/index.html` links in the product HTML files with the final HTTPS domains.

Each homepage has:

- One free-document converter on the main page only
- Three paid choices: Standard, Plus, and the five-product bundle
- An Other Products dropdown that excludes the current product
- A bundle checkout button in that dropdown
- A lower product portal section linking to the other four products

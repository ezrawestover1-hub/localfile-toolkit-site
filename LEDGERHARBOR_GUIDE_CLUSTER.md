# LedgerHarbor education cluster

These five guides support the existing converter and workflow landing pages without adding another conversion interface.

- `csv-to-iif-column-mapping-guide.html` explains semantic field selection and alternate header names, with a mapping table.
- `signed-amount-vs-debit-credit.html` compares one signed amount with separate debit and credit fields, including blanks and ambiguous rows.
- `prepare-bank-csv-for-iif.html` focuses on bank-export cleanup: headers, balances, delimiters, dates, and a pre-conversion checklist.
- `common-csv-formatting-errors.html` is troubleshooting-oriented and separates validation from manual cleanup for malformed CSV structure and values.
- `iif-export-review-checklist.html` is a post-export review workflow covering row fidelity, signs, accounts, totals, duplicates, source preservation, and backup testing.

All guides link to the relevant LedgerHarbor workflow and to related guides. They describe local browser processing where applicable and keep compatibility and review limitations visible.

## Rendering QA

The five routes returned HTTP 200 from the local static server. Chromium screenshots were captured at 1440×1000 and 390×844. Desktop layouts were readable, mobile layouts reflowed into a single column, and the mapping table remained contained in its scrollable table region. The in-app Browser plugin was unavailable in this session because its runtime failed with `Cannot redefine property: process`; Chromium was used as the fallback.

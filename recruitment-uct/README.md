# UCT Recruitment Pilot

A recruitment system built on Google Apps Script for Stay & Connect, a student team at the University of Cape Town. Applicants apply, upload documents, book interviews and respond to offers online. Staff review, shortlist, interview and appoint in one place.

It is shared under the MIT licence, so anyone running a small recruitment process can take it and adapt it.

**Author:** Tshidiso Molefe

## Where to start

| If you want to... | Read |
|---|---|
| Understand the problem, the design and the decisions | `docs/Report.pdf` |
| Set up your own copy | `docs/InstallationRunbook.pdf` |
| Run a recruitment round day to day | `docs/OperationsRunbook.pdf` |

## What's in this folder

```
├── README.md                 This file
├── LICENSE                   MIT licence
├── config.example.json       Checklist of settings you need (not loaded by the code)
├── SOURCE-PROVENANCE.json    Where the source came from, with file hashes
├── source/                   The code to copy into Google Apps Script
├── docs/                     The report and the two runbooks (PDF and LaTeX)
└── tests/                    Local checks of the recruitment rules
```

## Before you use it

- **It sends real emails.** There is no test mode. Test with fictional data and your own inboxes first.
- **It is a pilot.** It has passed local checks but has not been fully tested live or approved by UCT. The report explains the limits.
- **No personal data is included.** No applicant records, passwords, links or secrets are in this repo.

## Licence

MIT, © 2026 Tshidiso Molefe. The licence covers the code only. It does not give rights to the UCT or Stay & Connect names or logos. Replace `source/Brand.html` and the Stay & Connect labels with your own.

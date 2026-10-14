# Recruitment at UCT — reusable Google pilot

Tshidiso Molefe · 14 October 2026

## Read in this order

1. **docs/main-report.tex** — problem, design, trade-offs, outcomes and next steps.
2. **docs/installation-runbook.tex** — install under your Google account.
3. **docs/operations-runbook.tex** — navigate recruitment after setup.

Upload the ZIP to Overleaf, choose pdfLaTeX, and select the document you want as Main document. Each document is self-contained. The source folder is for Apps Script.

## Source files

Copy **source/Code.gs** and all five HTML files into one Apps Script project. Paste **source/appsscript.json** into its manifest. Preserve filenames and follow the installation runbook.

**config.example.json is a checklist, not an automatic import.** Setup and Settings supply runtime configuration.

The version sends real email to sign-in addresses and released recipients. First use inboxes you control and fictional application material. No test-mode switch has been added.

Brand.html is a neutral placeholder. Other Stay & Connect labels remain in the recovered source and should be adapted for reuse.

## Reuse and status

The software is supplied under the MIT licence in LICENSE. This grants reuse of the software, not rights to UCT or Stay & Connect names, logos, or institutional endorsement.

No applicant data, credentials, deployment URLs or authentication secrets are included. Institutional operation needs an approved account and data route. This is a recruitment pilot, not a room-allocation system.

## Checks

Run node tests/engine-checks.cjs locally. Recorded output is in tests/verification-results.json. These checks do not send mail or connect to Google.

Source hashes are in SOURCE-PROVENANCE.json. The installation notes and prior reports informed this documentation; a deployed version still needs an authorised integration test.

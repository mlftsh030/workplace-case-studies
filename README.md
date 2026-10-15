# Workplace case studies

**Practical improvements to real workflows: using existing tools, reducing repeated work and documenting the handover.**

These case studies come from my work at the University of Cape Town. They show two different responses to an
operational problem: configuring a feature that already existed, and building a small system around a recruitment
process.

By **[Tshidiso Molefe](https://github.com/mlftsh030)**, Computer Science and Applied Statistics student and Head Tutor
in UCT Finance.

## Start with a case study

| Case study | Problem and contribution | Evidence | Status |
|---|---|---|---|
| [Group assignment submission and mark capture](Finance%20Department/README.md) | Repeated entry of the same group mark. I configured Amathuba's group-assignment workflow, trialled it with colleagues and documented the process. | Overview report and operational runbook | Trialled in FTX1005F; the case-study notes report adoption in FTX3044F and a further rollout planned for FTX4056S. These are recorded statuses, not a new rollout audit. |
| [Stay & Connect recruitment pilot](recruitment-uct/README.md) | Applications, supporting documents and recruitment decisions needed a clearer shared workflow. I built an applicant and staff system on Google Apps Script. | Source code, design report, installation and operations runbooks | Pilot; authorised live testing and institutional approval remain outstanding. |

## What the work demonstrates

### Improve the process before adding software

The Finance case did not need a new application. Amathuba already supported one submission and one shared mark per
group. The work was recognising that fit, testing the configuration with colleagues and documenting how to use it.

For an illustrative class of 150 students in groups of five, mark capture changes from **150 individual entries to
30 shared entries**, an **80% reduction in entries**. This is arithmetic under those assumptions, not a measured 80%
reduction in working time. The trial retained the old process as a backup.

### Design for the people doing the administration

Stay & Connect recruits UCT students for paid hospitality roles in vacation accommodation. Its recruitment work
includes reviewing evidence, coordinating interviews, communicating decisions and recording appointments.

The pilot aims to give applicants a clearer route through that process and staff a readable view of what needs
attention. Google Apps Script connects the interface to Google services rather than requiring a separately operated
application server. The trade-offs include account quotas, platform constraints and the need for approved data
handling before institutional use.

The repository contains source and documentation. It does not demonstrate a completed live recruitment round or
measured reductions in administration time.

## Reading guide

| If you want to assess... | Read |
|---|---|
| The Finance problem, trial and calculation | [Finance overview report](Finance%20Department/OverviewReport.pdf) |
| How to repeat the group-assignment workflow | [Finance runbook](Finance%20Department/RunBook.pdf) |
| The recruitment process and design decisions | [Recruitment report](recruitment-uct/docs/Report.pdf) |
| How to install the recruitment pilot | [Installation runbook](recruitment-uct/docs/InstallationRunbook.pdf) |
| How to operate a recruitment round | [Operations runbook](recruitment-uct/docs/OperationsRunbook.pdf) |
| The recruitment implementation | [Apps Script and interface source](recruitment-uct/source/) |

## How I approach this work

- Start with the people doing the work and the decisions they need to make.
- Use tools the organisation already has where they fit the problem.
- Keep important decisions with authorised staff.
- Distinguish a calculation, a local check and a live operational result.
- Write runbooks so the process can be repeated and handed over.

## Scope, privacy and reuse

These are personal case studies, not official UCT publications or evidence of institutional endorsement. The reports
explain the context and limitations of each intervention. Avoid adding real student, staff or applicant records to
public examples or issue reports.

The [MIT licence](recruitment-uct/LICENSE) applies to the recruitment code within that folder. It does not grant rights
to UCT or Stay & Connect branding, and should not be assumed to license all documents in this repository.

**The recruitment pilot sends real email.** Read its setup guidance before running it, and use fictional data and
inboxes you control during authorised testing.

## Related work

- [SafeTrade](https://github.com/mlftsh030/safetrade): product validation supported by a Python and SQL ELT pipeline.
- [SL Tours management system](https://github.com/mlftsh030/SL-Tours-management-system): client-led tourism software
  developed through Tlokwa Digital Solutions.

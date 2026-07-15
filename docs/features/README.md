# Remaining Audit Items — Feature Roadmap

> 8 feature specs for the 8 remaining audit findings (P1-1 through P3-6)
> Total estimated effort: ~60-80 hours

## Summary

| #   | Feature                                                      | Priority | Estimate | Risk    | Depends On                        |
| --- | ------------------------------------------------------------ | -------- | -------- | ------- | --------------------------------- |
| 01  | [Type/Config Unification](01-type-unification.md)            | P1       | 4-6h     | Medium  | —                                 |
| 02  | [Complete Frontend i18n](02-complete-i18n.md)                | P1       | 8-12h    | Low     | —                                 |
| 03  | [Split Oversized Components](03-split-components.md)         | P1       | 16-24h   | High    | Feature 02 (extract translations) |
| 04  | [Icon Standardization](04-icon-standardization.md)           | P2       | 3-4h     | Low     | —                                 |
| 05  | [Platform Capabilities](05-platform-capabilities.md)         | P2       | 10-14h   | Low-Med | —                                 |
| 06  | [Search Engine Robustness](06-search-robustness.md)          | P2       | 6-8h     | Medium  | —                                 |
| 07  | [SFTP/Metalink Support](07-sftp-metalink.md)                 | P3       | 4-6h     | Low     | —                                 |
| 08  | [i18n Plural/Interpolation](08-i18n-plural-interpolation.md) | P3       | 3-4h     | Low     | Feature 02                        |

## Recommended Execution Order

### Sprint 1: Architecture (Feature 01 + 04)

Start with type unification (01) since it's the foundation for everything else. Pair with icon standardization (04) since it's quick and independent.

### Sprint 2: User Experience (Feature 02 + 08)

Complete i18n (02) before splitting components (03), since the translation dictionary extraction is part of both. Add plural/interpolation (08) as a follow-on.

### Sprint 3: Refactoring (Feature 03)

Split oversized components (03) is the highest-risk task. Do it after i18n is complete (translation dict already extracted) and with comprehensive test coverage.

### Sprint 4: Platform + Protocols (Feature 05 + 07)

Platform features (RTL, Windows sleep, autostart) and protocol additions (SFTP, Metalink) are independent and can be done in parallel or deferred.

### Sprint 5: Reliability (Feature 06)

Search engine robustness is an ongoing concern — the fixture tests should be maintained as living canaries for site layout changes.

## Audit Traceability

| Audit Item          | Feature Doc                     | Status  |
| ------------------- | ------------------------------- | ------- |
| P1-1, P1-13         | 01-type-unification.md          | Planned |
| P1-3                | 02-complete-i18n.md             | Planned |
| P1-4                | 03-split-components.md          | Planned |
| P2-9                | 04-icon-standardization.md      | Planned |
| P2-14, P2-16, P2-17 | 05-platform-capabilities.md     | Planned |
| P2-15               | 06-search-robustness.md         | Planned |
| P3-5                | 07-sftp-metalink.md             | Planned |
| P3-6                | 08-i18n-plural-interpolation.md | Planned |

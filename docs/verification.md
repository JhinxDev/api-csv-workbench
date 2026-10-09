# Verification scope

Initial local acceptance on October 8, 2026 used Node 24.15.0 on Windows. Syntax checks, the complete maintained test suite, the unrelated-working-directory CLI exercise, the Windows command launcher and the synthetic demo are required before freezing a candidate. The final external acceptance receipt identifies the exact commit, counts, package hash and native Windows/Ubuntu CI runs.

The maintained suite covers UTF-8/BOM/CSV quoting and malformed input; formula-safe cells; bounded query expansion; host/IDNA normalization; distinct query provenance; null rank; four real process-exit scenarios; input fingerprint refusal; lock protection; partial page budgets; real loopback HTTP encoding, auth rejection, rate/quota/retry handling, malformed/oversized/timeout/redirect refusal; fixed live-origin construction and fake-key reflection redaction; quota resume; separate account limit metadata; multi-page truncated results; header truncation; independent-query depth errors; and a competing writer committing between snapshot reads.

The fixed-origin bearer/reflection test mocks fetch and uses a clearly synthetic key. All other network acceptance uses real numeric-loopback HTTP sockets. Nothing contacts the paid search endpoint. Synthetic examples prove the program's behavior under supplied contracts, not current provider account behavior or real lead completeness.

An early restricted Windows run failed on directory rename in the sandbox's redirected temporary folder. The supported approved test route runs unchanged filesystem operations outside that redirection. A separate test-discovery defect initially executed a helper as a test; the maintained npm command now explicitly selects only the two test suites. Neither failure is recorded as an acceptance pass.

Automated fixture and loopback acceptance does not establish human operator mastery, paid-provider compatibility or a delivered client engagement.

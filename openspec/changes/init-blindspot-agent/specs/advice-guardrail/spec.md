# Spec Delta

## Purpose

Enforces strict compliance boundaries ensuring agent communications provide educational diagnostics and never deliver regulated financial advice.

## ADDED Requirements

### Requirement: Outbound Financial Advice Guardrail
The system SHALL classify every outbound message using an independent classifier model before transmitting the message to the user on Telegram.

#### Scenario: Compliant educational output
- **WHEN** the agent drafts an educational message explaining the concept of emergency runway without naming specific financial products
- **THEN** the classifier approves the message and delivers it to the user.

#### Scenario: Output containing regulated advice or specific securities
- **WHEN** the drafted message recommends purchasing a specific ETF, asset allocation percentage, or named pension provider
- **THEN** the classifier rejects the message, records a non-sensitive reason code, and allows at most one regenerated educational candidate, which must also be classified before delivery.

#### Scenario: Unavailable or malformed classification
- **WHEN** classification times out, is truncated, fails schema validation or is unavailable
- **THEN** no unapproved message is delivered and the interview remains resumable.

#### Scenario: Intermediate output
- **WHEN** the model streams tokens, calls a tool or raises an exception
- **THEN** no draft, tool card, raw error or intermediate response is sent before the final delivery guard approves it.

### Requirement: Grounded Educational Reports
The system SHALL render numbers, units, colours and blind-spot order deterministically and reject unsupported factual or jurisdiction-specific claims in generated wording.

#### Scenario: Explanation contradicts the scorecard
- **WHEN** generated wording introduces an unsupported number, severity or pension rule
- **THEN** the system uses a grounded educational replacement that passes the same classifier.

### Requirement: Isolated Authenticated Evaluation
The system SHALL expose authenticated evaluation sessions that use the same turn and safety pipeline as Telegram without sharing real-user state or sending Telegram messages.

#### Scenario: Invalid evaluation credentials
- **WHEN** a request lacks a valid dedicated evaluation credential
- **THEN** it cannot start a session, invoke a model or retrieve a response.

#### Scenario: Reproducible evaluation
- **WHEN** a failure is fixed and re-evaluated
- **THEN** evidence identifies the frozen cases, fresh session setup, application and evaluator versions, sample counts and errors without fabricating improvement.

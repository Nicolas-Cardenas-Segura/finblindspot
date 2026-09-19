# Spec Delta

## Purpose

Enforces strict compliance boundaries ensuring agent communications provide educational diagnostics and never deliver regulated financial advice.

## ADDED Requirements

### Requirement: Outbound Financial Advice Guardrail
The system SHALL classify every LLM-generated outbound message using an independent classifier model before transmitting the message to the user on Telegram. Templated messages that contain no model-generated text (fixed questions, disclaimers, rendered scorecard tables) are exempt.

#### Scenario: Compliant educational output
- **WHEN** the agent drafts an educational message explaining the concept of emergency runway without naming specific financial products
- **THEN** the classifier approves the message and delivers it to the user.

#### Scenario: Output containing regulated advice or specific securities
- **WHEN** the drafted message recommends purchasing a specific ETF, asset allocation percentage, or named pension provider
- **THEN** the classifier rejects the message, logs a compliance trigger, and causes the agent to regenerate a strictly educational explanation.

#### Scenario: Templated message
- **WHEN** the outbound message is a fixed template with no model-generated text
- **THEN** the system sends it without invoking the classifier.

### Requirement: Bounded Regeneration with Safe Fallback
The system SHALL limit guardrail-triggered regeneration to a fixed maximum of 2 attempts per outbound message and fall back to a pre-approved educational message when the limit is reached.

#### Scenario: Regeneration succeeds
- **WHEN** a regenerated draft passes the classifier within the attempt limit
- **THEN** the system delivers the passing draft and records the number of attempts on the compliance trigger.

#### Scenario: Regeneration limit reached
- **WHEN** two consecutive regenerated drafts are rejected by the classifier
- **THEN** the system sends the fixed fallback message for that indicator (a neutral description of the metric and why it matters), logs the event, and continues the conversation without further model calls for that turn.

### Requirement: Compliance Trigger Logging
The system SHALL persist every classifier rejection with timestamp, user or session identifier, the rejected draft, the verdict, and the attempt number.

#### Scenario: Rejection recorded
- **WHEN** the classifier returns `BLOCK` for a draft
- **THEN** a compliance trigger row is written to the local store before regeneration begins, so trigger counts can be compared across adversarial evaluation runs.

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
- **THEN** the classifier rejects the message, logs a compliance trigger, and causes the agent to regenerate a strictly educational explanation.

# Spec Delta

## Purpose

Enforces the advice boundary from `finance-blind-spot-v1-spec.html` §1 and §7: the AI may explain, clarify and rephrase library copy around the user's numbers, and may never recommend, invent a value, or add a finding the engine did not fire.

## ADDED Requirements

### Requirement: Blind-Spot Content Library Is the Source of Copy
The system SHALL render each fired rule from a static content file keyed by `rule_id` with the fields `title`, `headline`, `why`, `learn[]`, `ask`, `severity`, `topic` (v1 §7). The model MAY rephrase `why` around the user's own numbers; it SHALL NOT change `learn[]`, invent a new `ask`, name a product/provider/platform/fund, or add a rule that did not fire.

#### Scenario: Personalised why
- **WHEN** rule 1 fires with `cash_total / monthly_spending = 1.8`
- **THEN** the rendered message uses the library `title`, `headline`, `learn[]` and `ask` verbatim and a `why` that may mention "about 1.8 months of spending".

#### Scenario: Placeholder substitution
- **WHEN** library copy contains `{retire_age}` or `{pension_start_age}` (rule 9)
- **THEN** the placeholders are filled deterministically from the answers, not by the model.

#### Scenario: Model output diverges from the library
- **WHEN** the model's draft alters a `learn` item, adds an `ask`, or references a rule not in `blind_spots[]`
- **THEN** the draft is discarded and the unmodified library `why` is sent.

### Requirement: Required Results Copy
The system SHALL render the results message deterministically: headline bounded by retirement age ("At {retire_age}, you are about {shortfall} short"), the four-line table (capital needed, projected, shortfall in today's money, extra monthly), the 3%/5% sensitivity line, the assumptions line, and, when rule 9 fired, the excluded-pension conservative-estimate note.

#### Scenario: Minimum estimate label
- **WHEN** `is_minimum_estimate = true`
- **THEN** the results message begins with "Minimum estimate based on what you know today. Missing: …" listing the missing fields in plain words.

#### Scenario: No projection possible
- **WHEN** `retire_income_monthly` is `null`
- **THEN** the results message omits the projection block and shows only the action plan.

### Requirement: Outbound Financial Advice Guardrail
The system SHALL classify every LLM-generated outbound message using an independent classifier model before transmitting the message to the user on Telegram. Templated messages that contain no model-generated text (fixed questions, disclaimers, the results table, verbatim library copy) are exempt.

#### Scenario: Compliant educational output
- **WHEN** the agent drafts a `why` explaining the emergency fund finding without naming specific financial products
- **THEN** the classifier approves the message and delivers it to the user.

#### Scenario: Output containing regulated advice or specific securities
- **WHEN** the drafted message recommends purchasing a specific ETF, an asset allocation percentage, a named pension provider, or a pension transfer/consolidation
- **THEN** the classifier rejects the message, logs a compliance trigger, and causes the agent to regenerate a strictly educational explanation.

#### Scenario: Invented number
- **WHEN** the draft contains a monetary figure or percentage that does not appear in `results`, `derived`, `answers` or the library copy
- **THEN** the draft is rejected as an invented value and regenerated.

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
- **THEN** the system sends the unmodified library `why` for that rule, logs the event, and continues the conversation without further model calls for that turn.

### Requirement: Compliance Trigger Logging
The system SHALL persist every classifier rejection with timestamp, user or session identifier, the rejected draft, the verdict, and the attempt number.

#### Scenario: Rejection recorded
- **WHEN** the classifier returns `BLOCK` for a draft
- **THEN** a compliance trigger row is written to the local store before regeneration begins, so trigger counts can be compared across adversarial evaluation runs.

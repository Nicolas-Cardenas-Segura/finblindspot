# Spec Delta

## Purpose

Provides deterministic mathematical calculations and threshold rules to evaluate cross-border financial readiness and rank blind spots without LLM inference.

## ADDED Requirements

### Requirement: Deterministic Indicator Computation
The system SHALL compute financial health indicators using pure mathematical functions strictly isolated from model generation.

#### Scenario: Emergency runway calculation
- **WHEN** user reports liquid cash savings and monthly essential expenditures
- **THEN** the system computes the emergency runway in months as cash divided by monthly expenditure.

#### Scenario: Zero expenditure or income handling
- **WHEN** monthly expenditure is zero or missing
- **THEN** the system returns a safe null or sentinel indicator without throwing a division-by-zero exception.

### Requirement: Objective Threshold Scoring
The system SHALL map each calculated indicator to a deterministic Green, Amber, or Red flag using configurable numeric thresholds.

#### Scenario: Emergency runway below critical threshold
- **WHEN** the computed emergency runway is less than 3 months
- **THEN** the system assigns a Red flag to the emergency runway indicator.

#### Scenario: Multi-jurisdiction pension uncertainty
- **WHEN** user reports holding foreign pensions with unknown values or tax status
- **THEN** the system flags retirement visibility as Red or Amber based on the unverified count.

### Requirement: Top Blindspot Identification
The system SHALL prioritize and rank the top 3 financial blind spots from the scored indicators.

#### Scenario: Scorecard synthesis
- **WHEN** all indicators are evaluated
- **THEN** the system selects the highest-severity unaddressed indicators as the top three blind spots for user feedback.

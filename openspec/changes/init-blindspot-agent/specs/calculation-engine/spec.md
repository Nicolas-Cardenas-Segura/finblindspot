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
The system SHALL deterministically rank up to three supported financial flags or explicitly labelled data gaps, without inventing problems to fill the list.

#### Scenario: Scorecard synthesis
- **WHEN** all indicators are evaluated
- **THEN** the system selects up to three highest-priority supported flags with stable tie-breaking, distinguishing missing assessment from a known financial condition.

### Requirement: Comparable and Honest Inputs
The system SHALL preserve ranges and distinguish zero, unknown, skipped and not-applicable data; it MUST NOT invent exchange rates, mix currencies or silently use midpoints.

#### Scenario: Different currencies
- **WHEN** a calculation requires summing or comparing amounts in different currencies
- **THEN** the result is not assessed until the user supplies comparable approximate values.

#### Scenario: Range crosses a scoring band
- **WHEN** a valid calculated range spans multiple illustrative threshold bands
- **THEN** the report displays the range and an uncertain/not-assessed status instead of a falsely precise colour.

#### Scenario: Partial assessment
- **WHEN** a short interview lacks pension or asset data
- **THEN** those indicators remain not assessed and are never implicitly green.

### Requirement: Transparent Illustrative Thresholds
The system SHALL disclose that its versioned bands are educational product heuristics, not universal standards, and show the arithmetic and units behind each assessed result.

#### Scenario: User views a report
- **WHEN** a scored indicator is displayed
- **THEN** its range, units, inputs, applicable bands and limitations are available in the read-only report.

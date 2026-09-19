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
- **THEN** the system returns the emergency runway indicator in the `UNKNOWN` state without throwing a division-by-zero exception.

#### Scenario: Cross-border complexity calculation
- **WHEN** user reports income, assets, pensions, or tax residency spread across jurisdictions, some with unknown tax status
- **THEN** the system computes cross-border complexity as the count of distinct jurisdictions plus one per pension or asset with unknown tax status.

### Requirement: Base Currency Normalisation
The system SHALL perform all indicator calculations on amounts expressed in the user's declared base currency.

#### Scenario: Amount reported in a non-base currency
- **WHEN** the profile contains an amount in a currency other than the base currency
- **THEN** the system converts it using the bundled static rate table, records the rate used on the profile, and calculates with the converted value.

#### Scenario: Currency without a bundled rate
- **WHEN** an amount is reported in a currency that has no entry in the rate table
- **THEN** the system leaves the affected indicators in the `UNKNOWN` state and the interview asks the user for an approximate value in the base currency.

### Requirement: Objective Threshold Scoring
The system SHALL map each calculated indicator to a deterministic `GREEN`, `AMBER`, `RED`, or `UNKNOWN` state using numeric thresholds defined in a single configuration module with the following defaults:

| Indicator | Green | Amber | Red |
| --- | --- | --- | --- |
| Emergency Runway (months) | >= 6 | >= 3 and < 6 | < 3 |
| Debt Exposure (debt service / net income) | < 20% | 20% to 35% | > 35% |
| Retirement Visibility (pots with unknown value or tax status) | 0 and retirement age stated | 1, or retirement age missing | >= 2 |
| Asset Concentration (largest class or currency / total) | < 50% | 50% to 75% | > 75% |
| Cross-Border Complexity (jurisdictions + unknown tax statuses) | <= 2 with none unknown | 3, or 1 unknown | >= 4, or >= 2 unknown |

#### Scenario: Emergency runway below critical threshold
- **WHEN** the computed emergency runway is less than 3 months
- **THEN** the system assigns a `RED` state to the emergency runway indicator.

#### Scenario: Emergency runway on a boundary
- **WHEN** the computed emergency runway is exactly 3 months or exactly 6 months
- **THEN** the system assigns `AMBER` and `GREEN` respectively, and unit tests assert both boundaries.

#### Scenario: Multi-jurisdiction pension uncertainty
- **WHEN** user reports holding foreign pensions with unknown values or tax status
- **THEN** the system flags retirement visibility as `AMBER` for one unverified pot and `RED` for two or more.

#### Scenario: Insufficient input for an indicator
- **WHEN** the profile lacks the inputs an indicator requires
- **THEN** the indicator is reported as `UNKNOWN`, and the scorecard explanation states which input is missing rather than assigning a colour.

### Requirement: Top Blindspot Identification
The system SHALL rank scored indicators deterministically and present up to three as the user's top blind spots.

#### Scenario: Scorecard synthesis
- **WHEN** all indicators are evaluated
- **THEN** the system orders them `RED` > `AMBER` > `UNKNOWN` > `GREEN`, breaks ties by the fixed priority Emergency Runway, Debt Exposure, Retirement Visibility, Cross-Border Complexity, Asset Concentration, and selects the first three that are not `GREEN`.

#### Scenario: Fewer than three non-green indicators
- **WHEN** fewer than three indicators are in a non-`GREEN` state
- **THEN** the system presents only those indicators as blind spots and states that the remaining indicators are in good standing.

# Spec Delta

## Purpose

Enables baseline financial snapshot persistence and simulated longitudinal comparison to illustrate financial progress over time.

## ADDED Requirements

### Requirement: Baseline Snapshot Persistence
The system SHALL persist completed financial assessment profiles and resulting indicator scorecards associated with a user or session identifier and timestamp.

#### Scenario: Assessment completion
- **WHEN** user completes the diagnostic interview and scorecard generation
- **THEN** the system saves the profile and indicator results as a dated baseline snapshot.

### Requirement: Longitudinal Progress Comparison
The system SHALL support re-assessing key parameters and rendering a "then versus now" comparative report against the saved baseline.

#### Scenario: User requests progress re-check
- **WHEN** user triggers a simulated follow-up review (e.g. `/revisit`)
- **THEN** the system saves a new snapshot without mutating the baseline, compares only compatible metrics, and describes change without assuming improvement.

#### Scenario: Simulated elapsed time
- **WHEN** the user invokes a six-month demonstration
- **THEN** it is labelled as a simulation, retains actual timestamps and is not represented as autonomous scheduling.

### Requirement: Protected Read-only Reports
The system SHALL expose approved reports using expiring, revocable, report-scoped access capabilities, not public user or session identifiers.

#### Scenario: Missing, expired or revoked report capability
- **WHEN** a report request has no valid capability
- **THEN** no private report data is returned.

#### Scenario: Approved report viewed
- **WHEN** a valid capability is presented
- **THEN** the read-only dashboard displays the same approved facts as Telegram with no-store and no-referrer protections.

### Requirement: Limited Retention and Confirmed Deletion
The system SHALL disclose a limited retention window and allow confirmed deletion of a user's application records, sanitised conversation memory and report capabilities.

#### Scenario: Confirmed forget command
- **WHEN** a user confirms their forget request
- **THEN** their application data and access links are removed without affecting another user, and Telegram's independent history is not claimed to be deleted.

#### Scenario: Retention expires
- **WHEN** stored data passes the configured retention window
- **THEN** it is no longer available to reports or interviews and is removed from application and conversational storage.

# Spec Delta

## Purpose

Provides the deterministic retirement projection and the twenty-rule blind-spot engine defined in `finance-blind-spot-v1-spec.html` §5–§7, evaluated over the field-ID answer set without LLM inference.

## ADDED Requirements

### Requirement: Field-ID Contract
The engine SHALL read answers exclusively through the v1 field IDs (`age`, `retire_age`, `income_monthly`, `spend_housing`, `spend_living`, `spend_debt`, `spend_other`, `saving_monthly_other`, `cash_total`, `investments_total`, `home_value`, `home_mortgage`, `property_value`, `property_mortgage`, `property_for_retirement`, `debt_total`, `debt_max_rate`, `debt_at_retirement`, `pensions[]`, `retire_income_monthly`, protection and succession fields, and the five assumption fields) and SHALL never read free text.

#### Scenario: Derived values
- **WHEN** the money-in-and-out fields are present
- **THEN** the engine computes `monthly_spending = spend_housing + spend_living + spend_debt + spend_other` and `monthly_surplus = income_monthly - monthly_spending` and stores both under `derived`.

### Requirement: Zero, Unknown and Blank Are Distinct
The engine SHALL treat an explicit `0` as a real value, an "I don't know" as `null`, and a blank required field as not submitted. It SHALL never convert `null` to `0`.

#### Scenario: Unknown money field
- **WHEN** any field used by the projection is `null`
- **THEN** the engine leaves that term out, appends the field ID to `results.missing_fields`, sets `results.is_minimum_estimate = true`, and the matching blind-spot rule fires.

#### Scenario: Unknown retirement income
- **WHEN** `retire_income_monthly` is `null`
- **THEN** the engine skips the projection entirely (`results.required_pot`, `projected_assets`, `position` are `null`) and still evaluates every blind-spot rule.

#### Scenario: Explicit zero
- **WHEN** a user answers `0` for `debt_total` or `dependants`
- **THEN** the value participates in the maths and in rule conditions as `0`, and no missing-field entry is recorded.

### Requirement: Retirement Projection
The engine SHALL compute the projection with the following formulas (lump sums compound annually, monthly contributions compound monthly at `mr = investment_growth_rate / 12`):

```
years                 = retire_age - age                       # must be >= 1
months                = years * 12
target_income_today   = retire_income_monthly * 12
guaranteed_income_today = 12 * sum(pension_fixed_income_monthly
                          where pension_start_age <= retire_age and value known)
income_needed_today   = max(target_income_today - guaranteed_income_today, 0)
future_income_needed  = income_needed_today * (1 + inflation_rate) ^ years
required_pot          = future_income_needed / withdrawal_rate
projected_assets      = sum(pension_value) * (1 + investment_growth_rate) ^ years
                      + investments_total * (1 + investment_growth_rate) ^ years
                      + max(cash_total - 3 * monthly_spending, 0) * (1 + cash_growth_rate) ^ years
                      + property_equity_if_earmarked * (1 + property_growth_rate) ^ years
                      + sum(pension_contribution_monthly where contributions continue) * (((1 + mr) ^ months - 1) / mr)
                      + saving_monthly_other * (((1 + mr) ^ months - 1) / mr)
                      - debt_at_retirement
position              = projected_assets - required_pot
position_today        = position / (1 + inflation_rate) ^ years
extra_monthly         = -position * mr / ((1 + mr) ^ months - 1)   # only when position < 0
```
where `property_equity_if_earmarked = property_value - property_mortgage` only when `property_for_retirement = yes`, and the home the user lives in (`home_value`, `home_mortgage`) never counts.

#### Scenario: Withdrawal-rate sensitivity
- **WHEN** the projection is computed
- **THEN** `required_pot`, `position` and `position_today` are also produced at `withdrawal_rate` 3% and 5%, regardless of the user's chosen rate.

#### Scenario: Pension starting after retirement age
- **WHEN** a pension row has `pension_start_age > retire_age`
- **THEN** its value and fixed income are excluded from the projection, rule 9 fires, and the result carries the "position at `retire_age`, not lifetime shortfall" flag.

#### Scenario: Guaranteed income covers the target
- **WHEN** `guaranteed_income_today >= target_income_today`
- **THEN** `required_pot = 0` and the result is flagged `no_gap` rather than reporting a negative pot.

#### Scenario: Reference test cases
- **WHEN** the engine is run on the base inputs from the v1 spec §10 (age 40, retire 65, wants 2,000/month, state pension 600/month from 65, pot 120,000 with 500/month in, investments 50,000, cash 30,000, spending 3,000/month, default assumptions) and its three variants
- **THEN** it reproduces, within ±1 currency unit before display rounding: A required 879,387 / projected 907,888 / position +28,501 (3%: −264,628; 5%: +204,379; today +13,612); B projected 1,179,492 / position +300,105; C required 1,507,520 / position −599,632 (today −286,388; extra monthly 1,007); D required 1,256,267 / position −348,379 (today −166,388; extra monthly 585) with rule 9 fired.

### Requirement: Input Validation
The engine SHALL reject or reroute invalid inputs before computing.

#### Scenario: Already at or past retirement age
- **WHEN** `retire_age <= age`
- **THEN** the engine does not run the negative-timeline projection and returns a `already_retired` mode so the interview can switch to "what could my savings support now".

#### Scenario: Range checks
- **WHEN** a growth rate is `<= 0`, a money field is negative, or `pension_start_age` is outside `[age, 90]`
- **THEN** the engine returns a validation error naming the field ID and does not compute.

#### Scenario: Display rounding
- **WHEN** any money result is rendered
- **THEN** it is rounded to the nearest hundred; internal values stay unrounded.

### Requirement: Blind-Spot Rule Engine
The engine SHALL evaluate the twenty deterministic rules below after every assessment, each with a fixed base severity:

| # | rule_id | Fires when | Base |
| --- | --- | --- | --- |
| 1 | `thin_emergency_fund` | `cash_total < 3 × monthly_spending` | High |
| 2 | `negative_surplus` | `monthly_surplus < 0` | High |
| 3 | `family_unprotected` | `dependants > 0 and life_cover ≠ yes` | High |
| 4 | `no_income_safety_net` | `illness_cover ≠ yes` | Medium |
| 5 | `no_health_cover` | `health_cover ≠ yes` | High |
| 6 | `succession_gap` | `will = no`, or `will_country ≠ residence_country`, or `will_year` > 5 years old | Medium |
| 7 | `education_unfunded` | `dependants > 0 and education_funded ≠ yes` | Medium |
| 8 | `pension_visibility` | no pension rows, or any `pension_value = null` | High |
| 9 | `pension_timing_gap` | any `pension_start_age > retire_age` | High |
| 10 | `scattered_pensions` | more than one distinct `pension_country` | Medium |
| 11 | `beneficiary_gap` | `beneficiaries_named ≠ yes` | Medium |
| 12 | `fees_unknown` | `fees_known ≠ yes` | Medium |
| 13 | `expensive_debt` | (`debt_max_rate > 8%` or `null`) and `debt_total > 0` | High |
| 14 | `debt_into_retirement` | `debt_at_retirement > 0` or `null` | Medium |
| 15 | `cash_concentration` | `cash_total ÷ financial_assets > 30%` | Low |
| 16 | `property_concentration` | net property ÷ total net assets `> 60%` | Low |
| 17 | `currency_exposure` | `cash_currency_mismatch = yes`, or currency of `retire_country ≠ base_currency` | Medium |
| 18 | `single_point_of_failure` | partner exists, `decision_maker = me`, `partner_knows ≠ yes` | Medium |
| 19 | `retirement_gap` | `position < 0` at 4%, or `is_minimum_estimate = true` | High |
| 20 | `lifestyle_reality_check` | `retire_income_monthly < 60% of monthly_spending` | Low |

`≠ yes` is true for `no`, `don't know` and `null`. `financial_assets = cash_total + investments_total + sum(known pension_value)`.

#### Scenario: Unknown fires the rule
- **WHEN** a rule's input is `null` and the rule lists `null` (or `≠ yes`) as a firing condition
- **THEN** the rule fires and the rendered copy states plainly that the finding is "not knowing", not a failure.

#### Scenario: Country-to-currency lookup
- **WHEN** rule 17 is evaluated
- **THEN** the engine resolves `retire_country` through a bundled country→currency table; an unmapped country does not fire the rule and is recorded in `missing_fields` as `retire_country_currency`.

### Requirement: Severity Bump and Action Plan
The engine SHALL bump a fired rule's severity by one level (Low→Medium, Medium→High, High stays High) when its `topic` matches a `learning_priorities[]` tick, then select the top three fired rules ordered by bumped severity (High > Medium > Low) with ties broken by ascending rule number.

#### Scenario: Deterministic ordering
- **WHEN** the same answers and ticks are evaluated twice
- **THEN** the same three `rule_id`s are returned in the same order.

#### Scenario: Topic mapping
- **WHEN** `learning_priorities` contains `retirement`
- **THEN** rules 8, 9, 19 and 20 are bumped; the full mapping is protection→3,4,5; succession→6,11,18; education→7; savings→1,2; retirement→8,9,19,20; investments→12,15; cross_border→10,17; property→16; debt→13,14.

#### Scenario: Fewer than three fired
- **WHEN** fewer than three rules fire
- **THEN** only the fired rules are returned and the result states that no other blind spot was detected from the answers given.

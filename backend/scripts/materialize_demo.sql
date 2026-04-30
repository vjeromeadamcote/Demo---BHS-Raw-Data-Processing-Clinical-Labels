-- Digital Biomarker Explorer — materialize clustered demo subset.
--
-- Selects 100 USUBJIDs stratified by 3 age bins × 2 sexes = 6 strata, top
-- ~17 per stratum ranked by average wear_fraction (best-quality data first).
-- Then materializes PULSE, AMCLASS, STEP, SLPSTG, HEMET, SLPMET, SLPTIM,
-- ANNOTATIONS as clustered tables in biomarker_app.
--
-- Usage:
--   bq query --use_legacy_sql=false < materialize_demo.sql
--
-- All output tables are named `<src>_demo` and live in
-- `wb-rapid-apricot-2196.biomarker_app`.

-- Step 1: pick demo subjects into a seed table.
CREATE OR REPLACE TABLE `wb-rapid-apricot-2196.biomarker_app.demo_subjects`
CLUSTER BY USUBJID
AS
WITH dm AS (
  SELECT USUBJID, age_at_enrollment, SEX
  FROM `wb-spotless-eggplant-4340.screener.DM`
  WHERE SEX IN ('Male', 'Female') AND age_at_enrollment IS NOT NULL
),
wear AS (
  SELECT USUBJID, AVG(wear_fraction) AS wfrac
  FROM `wb-spotless-eggplant-4340.sensordata.ANNOTATIONS`
  GROUP BY USUBJID
),
joined AS (
  SELECT
    dm.USUBJID, dm.SEX, dm.age_at_enrollment,
    CASE
      WHEN dm.age_at_enrollment BETWEEN 18 AND 45 THEN '18-45'
      WHEN dm.age_at_enrollment BETWEEN 46 AND 60 THEN '46-60'
      WHEN dm.age_at_enrollment BETWEEN 61 AND 90 THEN '61-90'
      ELSE 'other'
    END AS age_bin,
    wear.wfrac
  FROM dm
  JOIN wear USING (USUBJID)
  WHERE wear.wfrac IS NOT NULL
),
ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY SEX, age_bin ORDER BY wfrac DESC) AS rn
  FROM joined
  WHERE age_bin != 'other'
)
SELECT USUBJID, SEX, age_at_enrollment, age_bin, wfrac
FROM ranked
WHERE rn <= 17;  -- 17 * 6 strata = up to 102 subjects (≈100 target)

-- Step 2: materialize each sensor table filtered to demo subjects, clustered.

CREATE OR REPLACE TABLE `wb-rapid-apricot-2196.biomarker_app.pulse_demo`
CLUSTER BY USUBJID, study_day_int
AS
SELECT s.*
FROM `wb-spotless-eggplant-4340.sensordata.PULSE` s
JOIN `wb-rapid-apricot-2196.biomarker_app.demo_subjects` d USING (USUBJID);

CREATE OR REPLACE TABLE `wb-rapid-apricot-2196.biomarker_app.amclass_demo`
CLUSTER BY USUBJID, study_day_int
AS
SELECT s.*
FROM `wb-spotless-eggplant-4340.sensordata.AMCLASS` s
JOIN `wb-rapid-apricot-2196.biomarker_app.demo_subjects` d USING (USUBJID);

CREATE OR REPLACE TABLE `wb-rapid-apricot-2196.biomarker_app.step_demo`
CLUSTER BY USUBJID, study_day_int
AS
SELECT s.*
FROM `wb-spotless-eggplant-4340.sensordata.STEP` s
JOIN `wb-rapid-apricot-2196.biomarker_app.demo_subjects` d USING (USUBJID);

CREATE OR REPLACE TABLE `wb-rapid-apricot-2196.biomarker_app.slpstg_demo`
CLUSTER BY USUBJID, study_day_int
AS
SELECT s.*
FROM `wb-spotless-eggplant-4340.sensordata.SLPSTG` s
JOIN `wb-rapid-apricot-2196.biomarker_app.demo_subjects` d USING (USUBJID);

CREATE OR REPLACE TABLE `wb-rapid-apricot-2196.biomarker_app.hemet_demo`
CLUSTER BY USUBJID, study_day_int
AS
SELECT s.*
FROM `wb-spotless-eggplant-4340.sensordata.HEMET` s
JOIN `wb-rapid-apricot-2196.biomarker_app.demo_subjects` d USING (USUBJID);

CREATE OR REPLACE TABLE `wb-rapid-apricot-2196.biomarker_app.slpmet_demo`
CLUSTER BY USUBJID
AS
SELECT s.*
FROM `wb-spotless-eggplant-4340.sensordata.SLPMET` s
JOIN `wb-rapid-apricot-2196.biomarker_app.demo_subjects` d USING (USUBJID);

CREATE OR REPLACE TABLE `wb-rapid-apricot-2196.biomarker_app.slptim_demo`
CLUSTER BY USUBJID
AS
SELECT s.*
FROM `wb-spotless-eggplant-4340.sensordata.SLPTIM` s
JOIN `wb-rapid-apricot-2196.biomarker_app.demo_subjects` d USING (USUBJID);

CREATE OR REPLACE TABLE `wb-rapid-apricot-2196.biomarker_app.annotations_demo`
CLUSTER BY USUBJID
AS
SELECT s.*
FROM `wb-spotless-eggplant-4340.sensordata.ANNOTATIONS` s
JOIN `wb-rapid-apricot-2196.biomarker_app.demo_subjects` d USING (USUBJID);

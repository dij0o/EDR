-- Phase 4: store patient PII and detailed clinical/administrative fields off-chain.
-- Apply before deploying the Phase 4 Database API. Back up MySQL first.
ALTER TABLE Patient
  ADD COLUMN Nationality VARCHAR(100) DEFAULT NULL,
  ADD COLUMN Address TEXT DEFAULT NULL,
  ADD COLUMN Blood_Type VARCHAR(3) DEFAULT NULL,
  ADD COLUMN Medical_History JSON DEFAULT NULL,
  ADD COLUMN Allergies JSON DEFAULT NULL,
  ADD COLUMN Medications JSON DEFAULT NULL,
  ADD COLUMN Insurance_Details JSON DEFAULT NULL,
  ADD COLUMN Clinic_ID INT DEFAULT NULL,
  ADD COLUMN Doctors JSON DEFAULT NULL,
  ADD COLUMN Modified_Date DATETIME DEFAULT NULL,
  ADD UNIQUE KEY uq_patient_emirates_id (Emirates_ID),
  ADD KEY idx_patient_clinic (Clinic_ID),
  ADD CONSTRAINT fk_patient_clinic FOREIGN KEY (Clinic_ID) REFERENCES Organization (Organization_ID);

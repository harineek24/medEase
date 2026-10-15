-- Row-level tenant boundary for PostgreSQL. The API sets these transaction
-- local values from a server-side session; request-supplied IDs are not used.
CREATE OR REPLACE FUNCTION medease_setting(name text) RETURNS text
LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting(name, true), '') $$;

CREATE OR REPLACE FUNCTION medease_can_access_patient(target_patient_id integer) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT target_patient_id IS NOT NULL AND (
        (medease_setting('medease.role') = 'patient'
         AND target_patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer)
        OR
        (medease_setting('medease.role') IN ('doctor', 'clinicadmin')
         AND EXISTS (
             SELECT 1 FROM patient_clinics pc
             WHERE pc.patient_id = target_patient_id AND pc.is_active
               AND pc.clinic_id = NULLIF(medease_setting('medease.clinic_id'), '')::integer
         ))
    )
$$;

CREATE OR REPLACE FUNCTION medease_auth_lookup(target_username text, target_email text DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT medease_setting('medease.auth_lookup') = 'true' AND (
        lower(coalesce(target_username, '')) = lower(coalesce(medease_setting('medease.login_name'), ''))
        OR (target_email IS NOT NULL AND lower(target_email) = lower(coalesce(medease_setting('medease.login_name'), '')))
    )
$$;

-- Legacy records can be mapped only where an appointment or doctor note gives
-- an unambiguous clinic relationship. Unlinked patients stay inaccessible to
-- clinic staff until an administrator explicitly links them.
DROP POLICY IF EXISTS tenant_patient_membership_select ON patient_clinics;
CREATE POLICY tenant_patient_membership_select ON patient_clinics
    FOR SELECT USING (
        (medease_setting('medease.role') = 'patient'
         AND patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer)
        OR (medease_setting('medease.role') IN ('doctor', 'clinicadmin')
            AND clinic_id = NULLIF(medease_setting('medease.clinic_id'), '')::integer)
        OR (medease_setting('medease.auth_lookup') = 'true'
            AND patient_id = NULLIF(medease_setting('medease.login_patient_id'), '')::integer)
    );
DROP POLICY IF EXISTS tenant_patient_membership_insert ON patient_clinics;
CREATE POLICY tenant_patient_membership_insert ON patient_clinics
    FOR INSERT WITH CHECK (
        (medease_setting('medease.role') = 'clinicadmin'
         AND clinic_id = NULLIF(medease_setting('medease.clinic_id'), '')::integer)
        OR (medease_setting('medease.role') = 'patient'
            AND patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer)
    );
DROP POLICY IF EXISTS tenant_patient_membership_update ON patient_clinics;
CREATE POLICY tenant_patient_membership_update ON patient_clinics FOR UPDATE USING (
    (medease_setting('medease.role') = 'patient'
     AND patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer)
    OR (medease_setting('medease.role') = 'clinicadmin'
        AND clinic_id = NULLIF(medease_setting('medease.clinic_id'), '')::integer)
) WITH CHECK (
    (medease_setting('medease.role') = 'patient'
     AND patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer)
    OR (medease_setting('medease.role') = 'clinicadmin'
        AND clinic_id = NULLIF(medease_setting('medease.clinic_id'), '')::integer)
);

DROP POLICY IF EXISTS tenant_patients_select ON patients;
CREATE POLICY tenant_patients_select ON patients FOR SELECT USING (
    medease_can_access_patient(id) OR medease_auth_lookup(username, email)
    OR (medease_setting('medease.role') = 'password_reset'
        AND id = NULLIF(medease_setting('medease.user_id'), '')::integer)
);
DROP POLICY IF EXISTS tenant_patients_insert ON patients;
CREATE POLICY tenant_patients_insert ON patients FOR INSERT WITH CHECK (
    medease_setting('medease.role') = 'clinicadmin'
);
DROP POLICY IF EXISTS tenant_patients_update ON patients;
CREATE POLICY tenant_patients_update ON patients FOR UPDATE USING (
    medease_setting('medease.role') IN ('clinicadmin', 'patient')
    AND medease_can_access_patient(id)
) WITH CHECK (medease_can_access_patient(id));

DROP POLICY IF EXISTS tenant_clinics_select ON clinics;
CREATE POLICY tenant_clinics_select ON clinics FOR SELECT USING (true);
DROP POLICY IF EXISTS tenant_doctors_select ON doctors;
CREATE POLICY tenant_doctors_select ON doctors FOR SELECT USING (
    (medease_setting('medease.user_id') IS NULL AND is_active = TRUE)
    OR (medease_setting('medease.role') = 'patient' AND is_active = TRUE)
    OR clinic_id = NULLIF(medease_setting('medease.clinic_id'), '')::integer
    OR (medease_setting('medease.role') = 'doctor_reset'
        AND id = NULLIF(medease_setting('medease.user_id'), '')::integer)
    OR medease_auth_lookup(username, email)
);
DROP POLICY IF EXISTS tenant_doctors_insert ON doctors;
CREATE POLICY tenant_doctors_insert ON doctors FOR INSERT WITH CHECK (
    medease_setting('medease.role') = 'clinicadmin'
    AND clinic_id = NULLIF(medease_setting('medease.clinic_id'), '')::integer
);
DROP POLICY IF EXISTS tenant_doctors_update ON doctors;
CREATE POLICY tenant_doctors_update ON doctors FOR UPDATE USING (
    clinic_id = NULLIF(medease_setting('medease.clinic_id'), '')::integer
) WITH CHECK (clinic_id = NULLIF(medease_setting('medease.clinic_id'), '')::integer);
DROP POLICY IF EXISTS tenant_admin_users_select ON admin_users;
CREATE POLICY tenant_admin_users_select ON admin_users FOR SELECT USING (
    clinic_id = NULLIF(medease_setting('medease.clinic_id'), '')::integer
    OR medease_auth_lookup(username, email)
);
DROP POLICY IF EXISTS tenant_admin_login_update ON admin_users;
CREATE POLICY tenant_admin_login_update ON admin_users FOR UPDATE USING (
    medease_auth_lookup(username, email)
) WITH CHECK (medease_auth_lookup(username, email));
DROP POLICY IF EXISTS tenant_patient_password_reset_update ON patients;
CREATE POLICY tenant_patient_password_reset_update ON patients FOR UPDATE USING (
    medease_setting('medease.role') = 'password_reset'
    AND id = NULLIF(medease_setting('medease.user_id'), '')::integer
) WITH CHECK (id = NULLIF(medease_setting('medease.user_id'), '')::integer);
DROP POLICY IF EXISTS tenant_doctor_password_reset_update ON doctors;
CREATE POLICY tenant_doctor_password_reset_update ON doctors FOR UPDATE USING (
    medease_setting('medease.role') = 'doctor_reset'
    AND id = NULLIF(medease_setting('medease.user_id'), '')::integer
) WITH CHECK (id = NULLIF(medease_setting('medease.user_id'), '')::integer);
DROP POLICY IF EXISTS tenant_services_select ON clinic_services;
CREATE POLICY tenant_services_select ON clinic_services FOR SELECT USING (true);
DROP POLICY IF EXISTS tenant_services_write ON clinic_services;
CREATE POLICY tenant_services_write ON clinic_services FOR ALL USING (
    medease_setting('medease.role') = 'clinicadmin'
    AND clinic_id = NULLIF(medease_setting('medease.clinic_id'), '')::integer
) WITH CHECK (
    medease_setting('medease.role') = 'clinicadmin'
    AND clinic_id = NULLIF(medease_setting('medease.clinic_id'), '')::integer
);
DROP POLICY IF EXISTS tenant_consult_configs_select ON consultation_configs;
CREATE POLICY tenant_consult_configs_select ON consultation_configs FOR SELECT USING (
    clinic_id IS NULL
    OR clinic_id = NULLIF(medease_setting('medease.clinic_id'), '')::integer
);
DROP POLICY IF EXISTS tenant_consult_configs_write ON consultation_configs;
CREATE POLICY tenant_consult_configs_write ON consultation_configs FOR ALL USING (
    medease_setting('medease.role') = 'clinicadmin'
    AND clinic_id = NULLIF(medease_setting('medease.clinic_id'), '')::integer
) WITH CHECK (
    medease_setting('medease.role') = 'clinicadmin'
    AND clinic_id = NULLIF(medease_setting('medease.clinic_id'), '')::integer
);
DROP POLICY IF EXISTS tenant_appointments_select ON appointments;
CREATE POLICY tenant_appointments_select ON appointments FOR SELECT USING (
    (patient_id IS NOT NULL AND medease_can_access_patient(patient_id))
    OR (clinic_id = NULLIF(medease_setting('medease.clinic_id'), '')::integer
        AND medease_setting('medease.role') IN ('doctor', 'clinicadmin'))
);
DROP POLICY IF EXISTS tenant_appointments_staff_write ON appointments;
CREATE POLICY tenant_appointments_staff_write ON appointments FOR ALL USING (
    medease_setting('medease.role') IN ('doctor', 'clinicadmin')
    AND clinic_id = NULLIF(medease_setting('medease.clinic_id'), '')::integer
) WITH CHECK (
    medease_setting('medease.role') IN ('doctor', 'clinicadmin')
    AND clinic_id = NULLIF(medease_setting('medease.clinic_id'), '')::integer
    AND (patient_id IS NULL OR medease_can_access_patient(patient_id))
);
DROP POLICY IF EXISTS tenant_appointments_patient_insert ON appointments;
CREATE POLICY tenant_appointments_patient_insert ON appointments FOR INSERT WITH CHECK (
    medease_setting('medease.role') = 'patient'
    AND patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer
    AND EXISTS (SELECT 1 FROM patient_clinics pc WHERE pc.patient_id = appointments.patient_id
                AND pc.clinic_id = appointments.clinic_id AND pc.is_active)
    AND EXISTS (SELECT 1 FROM doctors d WHERE d.id = appointments.doctor_id
                AND d.clinic_id = appointments.clinic_id)
);

-- Direct patient-owned records. Reads are shared between linked clinics per
-- the product's multi-clinic policy; writes are limited to the patient for
-- journal/update/payment rows and to clinic staff for clinical/business rows.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'summaries','chat_messages','consultation_sessions','vitals','doctor_notes',
    'journal_entries','billing','insurance','claims','payments','eligibility_checks',
    'statements','prescriptions','lab_results','patient_updates','doctor_replies'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_%I_select ON %I', t, t);
    EXECUTE format('CREATE POLICY tenant_%I_select ON %I FOR SELECT USING (medease_can_access_patient(patient_id))', t, t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS tenant_patient_self_journal_insert ON journal_entries;
CREATE POLICY tenant_patient_self_journal_insert ON journal_entries FOR INSERT WITH CHECK (
    medease_setting('medease.role') = 'patient'
    AND patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer
);
DROP POLICY IF EXISTS tenant_patient_self_journal_update ON journal_entries;
CREATE POLICY tenant_patient_self_journal_update ON journal_entries FOR UPDATE USING (
    medease_setting('medease.role') = 'patient'
    AND patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer
) WITH CHECK (patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer);
DROP POLICY IF EXISTS tenant_patient_self_update_insert ON patient_updates;
CREATE POLICY tenant_patient_self_update_insert ON patient_updates FOR INSERT WITH CHECK (
    medease_setting('medease.role') = 'patient'
    AND patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer
);
DROP POLICY IF EXISTS tenant_patient_summary_insert ON summaries;
CREATE POLICY tenant_patient_summary_insert ON summaries FOR INSERT WITH CHECK (
    medease_setting('medease.role') = 'patient'
    AND patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer
);
DROP POLICY IF EXISTS tenant_patient_summary_children_write ON medications;
CREATE POLICY tenant_patient_summary_children_write ON medications FOR ALL USING (
    medease_setting('medease.role') = 'patient'
    AND EXISTS (SELECT 1 FROM summaries s WHERE s.id = summary_id
                AND s.patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer)
) WITH CHECK (
    medease_setting('medease.role') = 'patient'
    AND EXISTS (SELECT 1 FROM summaries s WHERE s.id = summary_id
                AND s.patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer)
);
DROP POLICY IF EXISTS tenant_patient_tests_write ON test_results;
CREATE POLICY tenant_patient_tests_write ON test_results FOR ALL USING (
    medease_setting('medease.role') = 'patient'
    AND EXISTS (SELECT 1 FROM summaries s WHERE s.id = summary_id
                AND s.patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer)
) WITH CHECK (
    medease_setting('medease.role') = 'patient'
    AND EXISTS (SELECT 1 FROM summaries s WHERE s.id = summary_id
                AND s.patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer)
);
DROP POLICY IF EXISTS tenant_patient_interactions_write ON drug_interactions;
CREATE POLICY tenant_patient_interactions_write ON drug_interactions FOR ALL USING (
    medease_setting('medease.role') = 'patient'
    AND EXISTS (SELECT 1 FROM summaries s WHERE s.id = summary_id
                AND s.patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer)
) WITH CHECK (
    medease_setting('medease.role') = 'patient'
    AND EXISTS (SELECT 1 FROM summaries s WHERE s.id = summary_id
                AND s.patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer)
);
DROP POLICY IF EXISTS tenant_patient_consult_insert ON consultation_sessions;
CREATE POLICY tenant_patient_consult_insert ON consultation_sessions FOR INSERT WITH CHECK (
    medease_setting('medease.role') = 'patient'
    AND patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer
);
DROP POLICY IF EXISTS tenant_patient_consult_update ON consultation_sessions;
CREATE POLICY tenant_patient_consult_update ON consultation_sessions FOR UPDATE USING (
    medease_setting('medease.role') = 'patient'
    AND patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer
) WITH CHECK (patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer);
DROP POLICY IF EXISTS tenant_patient_consult_fields_write ON consultation_fields;
CREATE POLICY tenant_patient_consult_fields_write ON consultation_fields FOR ALL USING (
    medease_setting('medease.role') = 'patient'
    AND EXISTS (SELECT 1 FROM consultation_sessions cs WHERE cs.session_id = consultation_fields.session_id
                AND cs.patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer)
) WITH CHECK (
    medease_setting('medease.role') = 'patient'
    AND EXISTS (SELECT 1 FROM consultation_sessions cs WHERE cs.session_id = consultation_fields.session_id
                AND cs.patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer)
);
DROP POLICY IF EXISTS tenant_patient_chat_insert ON chat_messages;
CREATE POLICY tenant_patient_chat_insert ON chat_messages FOR INSERT WITH CHECK (
    medease_setting('medease.role') = 'patient'
    AND patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer
);
DROP POLICY IF EXISTS tenant_patient_payment_insert ON payments;
CREATE POLICY tenant_patient_payment_insert ON payments FOR INSERT WITH CHECK (
    patient_id = NULLIF(medease_setting('medease.user_id'), '')::integer
    AND medease_setting('medease.role') IN ('patient', 'clinicadmin')
);

-- Children inherit patient visibility from their parent record.
DROP POLICY IF EXISTS tenant_summary_children_select ON medications;
CREATE POLICY tenant_summary_children_select ON medications FOR SELECT USING (
    EXISTS (SELECT 1 FROM summaries s WHERE s.id = summary_id AND medease_can_access_patient(s.patient_id))
);
DROP POLICY IF EXISTS tenant_tests_select ON test_results;
CREATE POLICY tenant_tests_select ON test_results FOR SELECT USING (
    EXISTS (SELECT 1 FROM summaries s WHERE s.id = summary_id AND medease_can_access_patient(s.patient_id))
);
DROP POLICY IF EXISTS tenant_interactions_select ON drug_interactions;
CREATE POLICY tenant_interactions_select ON drug_interactions FOR SELECT USING (
    EXISTS (SELECT 1 FROM summaries s WHERE s.id = summary_id AND medease_can_access_patient(s.patient_id))
);
DROP POLICY IF EXISTS tenant_consult_fields_select ON consultation_fields;
CREATE POLICY tenant_consult_fields_select ON consultation_fields FOR SELECT USING (
    EXISTS (SELECT 1 FROM consultation_sessions cs WHERE cs.session_id = consultation_fields.session_id
            AND medease_can_access_patient(cs.patient_id))
);
DROP POLICY IF EXISTS tenant_claim_lines_select ON claim_lines;
CREATE POLICY tenant_claim_lines_select ON claim_lines FOR SELECT USING (
    EXISTS (SELECT 1 FROM claims c WHERE c.id = claim_id AND medease_can_access_patient(c.patient_id))
);
DROP POLICY IF EXISTS tenant_revenue_events_select ON revenue_cycle_events;
CREATE POLICY tenant_revenue_events_select ON revenue_cycle_events FOR SELECT USING (
    EXISTS (SELECT 1 FROM claims c WHERE c.id = claim_id AND medease_can_access_patient(c.patient_id))
);

-- Staff-only mutation policies for records that patients may read but must not
-- author or alter. Parent checks prevent cross-patient inserts by ID guessing.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'summaries','chat_messages','consultation_sessions','vitals','doctor_notes',
    'prescriptions','lab_results','doctor_replies'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_%I_staff_write ON %I', t, t);
    EXECUTE format('CREATE POLICY tenant_%I_staff_write ON %I FOR ALL USING (medease_setting(''medease.role'') IN (''doctor'',''clinicadmin'') AND medease_can_access_patient(patient_id)) WITH CHECK (medease_setting(''medease.role'') IN (''doctor'',''clinicadmin'') AND medease_can_access_patient(patient_id))', t, t);
  END LOOP;
END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'billing','insurance','claims','eligibility_checks','statements','payments'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_%I_staff_write ON %I', t, t);
    EXECUTE format('CREATE POLICY tenant_%I_staff_write ON %I FOR ALL USING (medease_setting(''medease.role'') = ''clinicadmin'' AND medease_can_access_patient(patient_id)) WITH CHECK (medease_setting(''medease.role'') = ''clinicadmin'' AND medease_can_access_patient(patient_id))', t, t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS tenant_medications_staff_write ON medications;
CREATE POLICY tenant_medications_staff_write ON medications FOR ALL USING (
    medease_setting('medease.role') IN ('doctor', 'clinicadmin')
    AND EXISTS (SELECT 1 FROM summaries s WHERE s.id = summary_id AND medease_can_access_patient(s.patient_id))
) WITH CHECK (
    medease_setting('medease.role') IN ('doctor', 'clinicadmin')
    AND EXISTS (SELECT 1 FROM summaries s WHERE s.id = summary_id AND medease_can_access_patient(s.patient_id))
);
DROP POLICY IF EXISTS tenant_tests_staff_write ON test_results;
CREATE POLICY tenant_tests_staff_write ON test_results FOR ALL USING (
    medease_setting('medease.role') IN ('doctor', 'clinicadmin')
    AND EXISTS (SELECT 1 FROM summaries s WHERE s.id = summary_id AND medease_can_access_patient(s.patient_id))
) WITH CHECK (
    medease_setting('medease.role') IN ('doctor', 'clinicadmin')
    AND EXISTS (SELECT 1 FROM summaries s WHERE s.id = summary_id AND medease_can_access_patient(s.patient_id))
);
DROP POLICY IF EXISTS tenant_interactions_staff_write ON drug_interactions;
CREATE POLICY tenant_interactions_staff_write ON drug_interactions FOR ALL USING (
    medease_setting('medease.role') IN ('doctor', 'clinicadmin')
    AND EXISTS (SELECT 1 FROM summaries s WHERE s.id = summary_id AND medease_can_access_patient(s.patient_id))
) WITH CHECK (
    medease_setting('medease.role') IN ('doctor', 'clinicadmin')
    AND EXISTS (SELECT 1 FROM summaries s WHERE s.id = summary_id AND medease_can_access_patient(s.patient_id))
);
DROP POLICY IF EXISTS tenant_consult_fields_staff_write ON consultation_fields;
CREATE POLICY tenant_consult_fields_staff_write ON consultation_fields FOR ALL USING (
    medease_setting('medease.role') IN ('doctor', 'clinicadmin')
    AND EXISTS (SELECT 1 FROM consultation_sessions cs WHERE cs.session_id = consultation_fields.session_id
                AND medease_can_access_patient(cs.patient_id))
) WITH CHECK (
    medease_setting('medease.role') IN ('doctor', 'clinicadmin')
    AND EXISTS (SELECT 1 FROM consultation_sessions cs WHERE cs.session_id = consultation_fields.session_id
                AND medease_can_access_patient(cs.patient_id))
);
DROP POLICY IF EXISTS tenant_claim_children_staff_write ON claim_lines;
CREATE POLICY tenant_claim_children_staff_write ON claim_lines FOR ALL USING (
    medease_setting('medease.role') = 'clinicadmin'
    AND EXISTS (SELECT 1 FROM claims c WHERE c.id = claim_id AND medease_can_access_patient(c.patient_id))
) WITH CHECK (
    medease_setting('medease.role') = 'clinicadmin'
    AND EXISTS (SELECT 1 FROM claims c WHERE c.id = claim_id AND medease_can_access_patient(c.patient_id))
);
DROP POLICY IF EXISTS tenant_revenue_staff_write ON revenue_cycle_events;
CREATE POLICY tenant_revenue_staff_write ON revenue_cycle_events FOR ALL USING (
    medease_setting('medease.role') = 'clinicadmin'
    AND EXISTS (SELECT 1 FROM claims c WHERE c.id = claim_id AND medease_can_access_patient(c.patient_id))
) WITH CHECK (
    medease_setting('medease.role') = 'clinicadmin'
    AND EXISTS (SELECT 1 FROM claims c WHERE c.id = claim_id AND medease_can_access_patient(c.patient_id))
);

ALTER TABLE patient_clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_clinics FORCE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE ROW LEVEL SECURITY;
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics FORCE ROW LEVEL SECURITY;
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors FORCE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users FORCE ROW LEVEL SECURITY;
ALTER TABLE clinic_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_services FORCE ROW LEVEL SECURITY;
ALTER TABLE consultation_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_configs FORCE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;

-- Trusted startup migrations need an explicit RLS path on core tables too.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'patient_clinics','patients','clinics','doctors','admin_users',
    'clinic_services','consultation_configs','appointments'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_system_access ON %I', t);
    EXECUTE format('CREATE POLICY tenant_system_access ON %I FOR ALL USING (medease_setting(''medease.role'') = ''system'') WITH CHECK (medease_setting(''medease.role'') = ''system'')', t);
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'summaries','chat_messages','consultation_sessions','vitals','doctor_notes',
    'journal_entries','billing','insurance','claims','payments','eligibility_checks',
    'statements','prescriptions','lab_results','patient_updates','doctor_replies',
    'medications','test_results','drug_interactions','consultation_fields',
    'claim_lines','revenue_cycle_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    -- Database initialization and controlled maintenance run with a separate
    -- transaction-local system principal. Normal HTTP requests never receive it.
    EXECUTE format('DROP POLICY IF EXISTS tenant_system_access ON %I', t);
    EXECUTE format('CREATE POLICY tenant_system_access ON %I FOR ALL USING (medease_setting(''medease.role'') = ''system'') WITH CHECK (medease_setting(''medease.role'') = ''system'')', t);
  END LOOP;
END $$;

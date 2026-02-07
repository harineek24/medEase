"""
MedEase Database Layer
SQLite database with SQLAlchemy for storing patient records, summaries, and chat history.
"""

import os
import sqlite3
from datetime import datetime
from typing import Optional, List, Dict, Any
from contextlib import contextmanager

# Database file path
DB_PATH = os.path.join(os.path.dirname(__file__), "medease.db")


def get_connection():
    """Get a database connection with row factory for dict-like access."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def get_db():
    """Context manager for database connections."""
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


def init_database():
    """Initialize the database with all required tables."""
    with get_db() as conn:
        cursor = conn.cursor()

        # Patients table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS patients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                date_of_birth TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Summaries table - stores EHR analysis results
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS summaries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER,
                raw_summary TEXT NOT NULL,
                file_path TEXT,
                original_filename TEXT,
                diagnosis TEXT,
                visit_date TEXT,
                visit_location TEXT,
                next_steps TEXT,
                warning_signs TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients(id)
            )
        """)

        # Medications table - stores medication details per summary
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS medications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                summary_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                dosage TEXT,
                frequency TEXT,
                purpose TEXT,
                rxcui TEXT,
                drug_class TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (summary_id) REFERENCES summaries(id)
            )
        """)

        # Test results table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS test_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                summary_id INTEGER NOT NULL,
                test_name TEXT NOT NULL,
                value TEXT,
                unit TEXT,
                reference_range TEXT,
                status TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (summary_id) REFERENCES summaries(id)
            )
        """)

        # Drug interactions table - stores analysis results
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS drug_interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                summary_id INTEGER NOT NULL,
                drug1 TEXT NOT NULL,
                drug2 TEXT NOT NULL,
                severity TEXT,
                description TEXT,
                recommendation TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (summary_id) REFERENCES summaries(id)
            )
        """)

        # Chat messages table - for both patient-specific and general chats
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                chat_type TEXT NOT NULL,
                patient_id INTEGER,
                summary_id INTEGER,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients(id),
                FOREIGN KEY (summary_id) REFERENCES summaries(id)
            )
        """)

        # Analytics table - for tracking usage stats
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS analytics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                event_data TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Consultation sessions table - for voice consultations
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS consultation_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE NOT NULL,
                patient_id INTEGER,
                status TEXT DEFAULT 'active',
                is_emergency INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                completed_at TEXT,
                FOREIGN KEY (patient_id) REFERENCES patients(id)
            )
        """)

        # Consultation fields table - stores extracted information
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS consultation_fields (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                field_name TEXT NOT NULL,
                field_label TEXT NOT NULL,
                field_value TEXT NOT NULL,
                confirmed INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES consultation_sessions(session_id)
            )
        """)

        # Clinics table - stores clinic information
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS clinics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                address TEXT,
                city TEXT,
                state TEXT,
                zip_code TEXT,
                phone TEXT,
                email TEXT,
                website TEXT,
                description TEXT,
                logo_url TEXT,
                operating_hours TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Doctors table - stores physician information
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS doctors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                clinic_id INTEGER,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                title TEXT DEFAULT 'MD',
                specialty TEXT,
                sub_specialty TEXT,
                npi_number TEXT,
                license_number TEXT,
                email TEXT,
                phone TEXT,
                bio TEXT,
                photo_url TEXT,
                accepting_patients INTEGER DEFAULT 1,
                languages TEXT DEFAULT 'English',
                education TEXT,
                certifications TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (clinic_id) REFERENCES clinics(id)
            )
        """)

        # Clinic services table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS clinic_services (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                clinic_id INTEGER NOT NULL,
                service_name TEXT NOT NULL,
                description TEXT,
                category TEXT,
                duration_minutes INTEGER DEFAULT 30,
                price REAL,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (clinic_id) REFERENCES clinics(id)
            )
        """)

        # Appointments table - for scheduling
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS appointments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER,
                doctor_id INTEGER,
                clinic_id INTEGER,
                service_id INTEGER,
                appointment_date TEXT NOT NULL,
                appointment_time TEXT NOT NULL,
                duration_minutes INTEGER DEFAULT 30,
                status TEXT DEFAULT 'scheduled',
                notes TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients(id),
                FOREIGN KEY (doctor_id) REFERENCES doctors(id),
                FOREIGN KEY (clinic_id) REFERENCES clinics(id),
                FOREIGN KEY (service_id) REFERENCES clinic_services(id)
            )
        """)

        # Admin users table - for clinic management
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS admin_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                email TEXT,
                role TEXT DEFAULT 'staff',
                clinic_id INTEGER,
                is_active INTEGER DEFAULT 1,
                last_login TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (clinic_id) REFERENCES clinics(id)
            )
        """)

        # Consultation configs table - admin-configurable voice consultation settings
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS consultation_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                config_id TEXT UNIQUE NOT NULL,
                clinic_id INTEGER,
                name TEXT NOT NULL,
                description TEXT,
                fields TEXT NOT NULL,
                ai_prompt TEXT,
                system_instruction TEXT,
                voice_name TEXT DEFAULT 'Aoede',
                success_message TEXT DEFAULT 'Thank you for completing the consultation!',
                emergency_message TEXT DEFAULT 'This appears to be an emergency. Please call 911 immediately.',
                settings TEXT DEFAULT '{}',
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (clinic_id) REFERENCES clinics(id)
            )
        """)

        # Vitals table - stores patient vital signs
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS vitals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER NOT NULL,
                recorded_by INTEGER,
                heart_rate REAL,
                systolic_bp REAL,
                diastolic_bp REAL,
                oxygen_level REAL,
                temperature REAL,
                respiratory_rate REAL,
                weight REAL,
                notes TEXT,
                recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients(id),
                FOREIGN KEY (recorded_by) REFERENCES doctors(id)
            )
        """)

        # Doctor notes table - text + voice notes from doctor to patient
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS doctor_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                doctor_id INTEGER NOT NULL,
                patient_id INTEGER NOT NULL,
                note_type TEXT DEFAULT 'text',
                content TEXT,
                audio_url TEXT,
                is_read INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (doctor_id) REFERENCES doctors(id),
                FOREIGN KEY (patient_id) REFERENCES patients(id)
            )
        """)

        # Journal entries table - patient daily journal entries
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS journal_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER NOT NULL,
                entry_text TEXT,
                mood TEXT,
                pain_level INTEGER,
                symptoms TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients(id)
            )
        """)

        # Billing table - patient billing and credit balances
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS billing (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER NOT NULL,
                appointment_id INTEGER,
                description TEXT NOT NULL,
                amount REAL NOT NULL,
                insurance_covered REAL DEFAULT 0,
                patient_responsibility REAL DEFAULT 0,
                status TEXT DEFAULT 'pending',
                payment_date TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients(id),
                FOREIGN KEY (appointment_id) REFERENCES appointments(id)
            )
        """)

        # Insurance table - patient insurance info
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS insurance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER NOT NULL,
                provider_name TEXT NOT NULL,
                policy_number TEXT,
                group_number TEXT,
                subscriber_name TEXT,
                effective_date TEXT,
                expiration_date TEXT,
                copay REAL,
                deductible REAL,
                deductible_met REAL DEFAULT 0,
                is_primary INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients(id)
            )
        """)

        # Prescriptions table - e-prescribing
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS prescriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER NOT NULL,
                doctor_id INTEGER NOT NULL,
                medication_name TEXT NOT NULL,
                dosage TEXT,
                frequency TEXT,
                quantity INTEGER,
                refills INTEGER DEFAULT 0,
                instructions TEXT,
                status TEXT DEFAULT 'active',
                prescribed_date TEXT DEFAULT CURRENT_TIMESTAMP,
                expiry_date TEXT,
                pharmacy TEXT,
                FOREIGN KEY (patient_id) REFERENCES patients(id),
                FOREIGN KEY (doctor_id) REFERENCES doctors(id)
            )
        """)

        # Lab results table - labs and radiology
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lab_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER NOT NULL,
                ordered_by INTEGER,
                lab_type TEXT NOT NULL,
                test_name TEXT NOT NULL,
                result_value TEXT,
                unit TEXT,
                reference_range TEXT,
                status TEXT DEFAULT 'pending',
                is_abnormal INTEGER DEFAULT 0,
                notes TEXT,
                ordered_date TEXT DEFAULT CURRENT_TIMESTAMP,
                result_date TEXT,
                FOREIGN KEY (patient_id) REFERENCES patients(id),
                FOREIGN KEY (ordered_by) REFERENCES doctors(id)
            )
        """)

        print("Database initialized successfully!")

        # Seed sample data if tables are empty
        _seed_sample_data(cursor)


def _seed_sample_data(cursor):
    """Seed the database with sample clinic and doctor data."""
    # Check if clinics already exist
    cursor.execute("SELECT COUNT(*) as count FROM clinics")
    if cursor.fetchone()['count'] > 0:
        return  # Already seeded

    # Sample Clinics (inspired by real small community clinics)
    clinics = [
        {
            "name": "Sunrise Community Health Center",
            "address": "1250 Medical Center Drive",
            "city": "Santa Clara",
            "state": "CA",
            "zip_code": "95051",
            "phone": "(408) 555-0100",
            "email": "info@sunrisechc.org",
            "website": "https://www.sunrisechc.org",
            "description": "A patient-centered medical home providing comprehensive primary care services to the Santa Clara Valley community since 1985.",
            "operating_hours": "Mon-Fri: 8AM-6PM, Sat: 9AM-1PM"
        },
        {
            "name": "Valley Family Medicine",
            "address": "789 Oak Street, Suite 200",
            "city": "San Jose",
            "state": "CA",
            "zip_code": "95112",
            "phone": "(408) 555-0200",
            "email": "appointments@valleyfamilymed.com",
            "website": "https://www.valleyfamilymed.com",
            "description": "Family-owned practice providing personalized healthcare for all ages. We believe in treating the whole person, not just symptoms.",
            "operating_hours": "Mon-Thu: 8AM-5PM, Fri: 8AM-3PM"
        },
        {
            "name": "Mission Street Urgent Care",
            "address": "456 Mission Street",
            "city": "Fremont",
            "state": "CA",
            "zip_code": "94538",
            "phone": "(510) 555-0300",
            "email": "care@missionurgent.com",
            "website": "https://www.missionurgent.com",
            "description": "Walk-in urgent care clinic providing immediate treatment for non-life-threatening illnesses and injuries. No appointment necessary.",
            "operating_hours": "Daily: 8AM-10PM, Holidays: 10AM-6PM"
        },
        {
            "name": "Bayside Pediatric Associates",
            "address": "321 Harbor View Road",
            "city": "Redwood City",
            "state": "CA",
            "zip_code": "94063",
            "phone": "(650) 555-0400",
            "email": "hello@baysidepeds.com",
            "website": "https://www.baysidepeds.com",
            "description": "Dedicated to providing exceptional pediatric care from newborns to young adults. Your child's health is our priority.",
            "operating_hours": "Mon-Fri: 8AM-5PM, Sat: 9AM-12PM (sick visits)"
        },
        {
            "name": "Golden Gate Internal Medicine",
            "address": "555 Van Ness Avenue, Floor 3",
            "city": "San Francisco",
            "state": "CA",
            "zip_code": "94102",
            "phone": "(415) 555-0500",
            "email": "contact@ggim.health",
            "website": "https://www.ggim.health",
            "description": "Board-certified internists specializing in adult medicine, chronic disease management, and preventive care.",
            "operating_hours": "Mon-Fri: 9AM-5PM"
        }
    ]

    for clinic in clinics:
        cursor.execute("""
            INSERT INTO clinics (name, address, city, state, zip_code, phone, email, website, description, operating_hours)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (clinic["name"], clinic["address"], clinic["city"], clinic["state"],
              clinic["zip_code"], clinic["phone"], clinic["email"], clinic["website"],
              clinic["description"], clinic["operating_hours"]))

    # Sample Doctors
    doctors = [
        # Sunrise Community Health Center (clinic_id=1)
        {
            "clinic_id": 1,
            "first_name": "Sarah",
            "last_name": "Chen",
            "title": "MD",
            "specialty": "Family Medicine",
            "sub_specialty": "Geriatric Care",
            "npi_number": "1234567890",
            "email": "s.chen@sunrisechc.org",
            "bio": "Dr. Chen has been serving the Santa Clara community for over 15 years. She is passionate about preventive care and building long-term relationships with her patients.",
            "languages": "English, Mandarin, Cantonese",
            "education": "Stanford University School of Medicine",
            "certifications": "ABFM Board Certified, CAQ Geriatric Medicine"
        },
        {
            "clinic_id": 1,
            "first_name": "Michael",
            "last_name": "Rodriguez",
            "title": "DO",
            "specialty": "Family Medicine",
            "sub_specialty": "Sports Medicine",
            "npi_number": "1234567891",
            "email": "m.rodriguez@sunrisechc.org",
            "bio": "Dr. Rodriguez brings an integrative approach to family medicine, combining osteopathic principles with modern evidence-based care.",
            "languages": "English, Spanish",
            "education": "Touro University California",
            "certifications": "AOA Board Certified, CAQSM"
        },
        # Valley Family Medicine (clinic_id=2)
        {
            "clinic_id": 2,
            "first_name": "Jennifer",
            "last_name": "Patel",
            "title": "MD",
            "specialty": "Family Medicine",
            "sub_specialty": "Women's Health",
            "npi_number": "1234567892",
            "email": "j.patel@valleyfamilymed.com",
            "bio": "Dr. Patel founded Valley Family Medicine with a vision of providing compassionate, accessible healthcare. She has a special interest in women's health across all life stages.",
            "languages": "English, Hindi, Gujarati",
            "education": "UCLA David Geffen School of Medicine",
            "certifications": "ABFM Board Certified"
        },
        {
            "clinic_id": 2,
            "first_name": "David",
            "last_name": "Kim",
            "title": "MD",
            "specialty": "Internal Medicine",
            "sub_specialty": "Diabetes & Metabolism",
            "npi_number": "1234567893",
            "email": "d.kim@valleyfamilymed.com",
            "bio": "Dr. Kim specializes in managing complex chronic conditions with a focus on diabetes care and metabolic health optimization.",
            "languages": "English, Korean",
            "education": "UCSF School of Medicine",
            "certifications": "ABIM Board Certified, CDCES"
        },
        # Mission Street Urgent Care (clinic_id=3)
        {
            "clinic_id": 3,
            "first_name": "Amanda",
            "last_name": "Foster",
            "title": "MD",
            "specialty": "Emergency Medicine",
            "sub_specialty": "Urgent Care",
            "npi_number": "1234567894",
            "email": "a.foster@missionurgent.com",
            "bio": "Dr. Foster brings 10 years of ER experience to urgent care, ensuring patients receive efficient, high-quality treatment for acute illnesses and injuries.",
            "languages": "English",
            "education": "Johns Hopkins School of Medicine",
            "certifications": "ABEM Board Certified"
        },
        {
            "clinic_id": 3,
            "first_name": "James",
            "last_name": "Washington",
            "title": "PA-C",
            "specialty": "Physician Assistant",
            "sub_specialty": "Urgent Care",
            "npi_number": "1234567895",
            "email": "j.washington@missionurgent.com",
            "bio": "James has worked in urgent care settings for 8 years and is skilled in treating a wide range of acute conditions.",
            "languages": "English, Spanish",
            "education": "Samuel Merritt University PA Program",
            "certifications": "NCCPA Certified"
        },
        # Bayside Pediatric Associates (clinic_id=4)
        {
            "clinic_id": 4,
            "first_name": "Lisa",
            "last_name": "Nakamura",
            "title": "MD",
            "specialty": "Pediatrics",
            "sub_specialty": "Developmental Pediatrics",
            "npi_number": "1234567896",
            "email": "l.nakamura@baysidepeds.com",
            "bio": "Dr. Nakamura has dedicated her career to children's health, with special expertise in developmental milestones and behavioral health.",
            "languages": "English, Japanese",
            "education": "Harvard Medical School",
            "certifications": "ABP Board Certified, DBP"
        },
        {
            "clinic_id": 4,
            "first_name": "Robert",
            "last_name": "Thompson",
            "title": "MD",
            "specialty": "Pediatrics",
            "sub_specialty": "Adolescent Medicine",
            "npi_number": "1234567897",
            "email": "r.thompson@baysidepeds.com",
            "bio": "Dr. Thompson enjoys working with teens and young adults, helping them navigate the unique health challenges of adolescence.",
            "languages": "English",
            "education": "University of Michigan Medical School",
            "certifications": "ABP Board Certified, SAM"
        },
        # Golden Gate Internal Medicine (clinic_id=5)
        {
            "clinic_id": 5,
            "first_name": "Elizabeth",
            "last_name": "O'Connor",
            "title": "MD",
            "specialty": "Internal Medicine",
            "sub_specialty": "Cardiovascular Risk Management",
            "npi_number": "1234567898",
            "email": "e.oconnor@ggim.health",
            "bio": "Dr. O'Connor specializes in preventive cardiology and helping patients reduce their cardiovascular risk through lifestyle medicine.",
            "languages": "English, Irish",
            "education": "Columbia University Vagelos College",
            "certifications": "ABIM Board Certified, Lifestyle Medicine Certified"
        },
        {
            "clinic_id": 5,
            "first_name": "Ahmed",
            "last_name": "Hassan",
            "title": "MD",
            "specialty": "Internal Medicine",
            "sub_specialty": "Pulmonology",
            "npi_number": "1234567899",
            "email": "a.hassan@ggim.health",
            "bio": "Dr. Hassan has expertise in respiratory conditions, sleep disorders, and helping patients manage chronic lung diseases.",
            "languages": "English, Arabic, French",
            "education": "Yale School of Medicine",
            "certifications": "ABIM Board Certified, Pulmonary Disease"
        }
    ]

    for doc in doctors:
        cursor.execute("""
            INSERT INTO doctors (clinic_id, first_name, last_name, title, specialty, sub_specialty,
                               npi_number, email, bio, languages, education, certifications)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (doc["clinic_id"], doc["first_name"], doc["last_name"], doc["title"],
              doc["specialty"], doc["sub_specialty"], doc["npi_number"], doc["email"],
              doc["bio"], doc["languages"], doc["education"], doc["certifications"]))

    # Sample Services for each clinic
    services = [
        # Sunrise Community Health Center
        {"clinic_id": 1, "service_name": "Annual Physical Exam", "category": "Preventive", "duration_minutes": 45, "price": 150.00},
        {"clinic_id": 1, "service_name": "Sick Visit", "category": "Primary Care", "duration_minutes": 20, "price": 100.00},
        {"clinic_id": 1, "service_name": "Chronic Disease Management", "category": "Primary Care", "duration_minutes": 30, "price": 125.00},
        {"clinic_id": 1, "service_name": "Immunizations", "category": "Preventive", "duration_minutes": 15, "price": 50.00},
        # Valley Family Medicine
        {"clinic_id": 2, "service_name": "New Patient Visit", "category": "Primary Care", "duration_minutes": 60, "price": 200.00},
        {"clinic_id": 2, "service_name": "Follow-up Visit", "category": "Primary Care", "duration_minutes": 20, "price": 100.00},
        {"clinic_id": 2, "service_name": "Women's Wellness Exam", "category": "Preventive", "duration_minutes": 45, "price": 175.00},
        {"clinic_id": 2, "service_name": "Diabetes Care Visit", "category": "Chronic Care", "duration_minutes": 30, "price": 125.00},
        # Mission Street Urgent Care
        {"clinic_id": 3, "service_name": "Urgent Care Visit", "category": "Urgent Care", "duration_minutes": 30, "price": 175.00},
        {"clinic_id": 3, "service_name": "X-Ray Services", "category": "Diagnostic", "duration_minutes": 20, "price": 125.00},
        {"clinic_id": 3, "service_name": "Laceration Repair", "category": "Procedures", "duration_minutes": 30, "price": 250.00},
        {"clinic_id": 3, "service_name": "Rapid COVID/Flu Test", "category": "Diagnostic", "duration_minutes": 15, "price": 75.00},
        # Bayside Pediatric Associates
        {"clinic_id": 4, "service_name": "Well-Child Visit", "category": "Preventive", "duration_minutes": 30, "price": 150.00},
        {"clinic_id": 4, "service_name": "Sick Child Visit", "category": "Primary Care", "duration_minutes": 20, "price": 125.00},
        {"clinic_id": 4, "service_name": "ADHD Evaluation", "category": "Behavioral", "duration_minutes": 60, "price": 300.00},
        {"clinic_id": 4, "service_name": "Sports Physical", "category": "Preventive", "duration_minutes": 20, "price": 75.00},
        # Golden Gate Internal Medicine
        {"clinic_id": 5, "service_name": "Executive Health Exam", "category": "Preventive", "duration_minutes": 90, "price": 500.00},
        {"clinic_id": 5, "service_name": "Cardiovascular Risk Assessment", "category": "Specialty", "duration_minutes": 45, "price": 225.00},
        {"clinic_id": 5, "service_name": "Sleep Consultation", "category": "Specialty", "duration_minutes": 45, "price": 200.00},
        {"clinic_id": 5, "service_name": "Medication Review", "category": "Primary Care", "duration_minutes": 30, "price": 125.00},
    ]

    for svc in services:
        cursor.execute("""
            INSERT INTO clinic_services (clinic_id, service_name, category, duration_minutes, price)
            VALUES (?, ?, ?, ?, ?)
        """, (svc["clinic_id"], svc["service_name"], svc["category"], svc["duration_minutes"], svc["price"]))

    # Create default admin user (password: admin123 - should be changed!)
    import hashlib
    password_hash = hashlib.sha256("admin123".encode()).hexdigest()
    cursor.execute("""
        INSERT INTO admin_users (username, password_hash, email, role)
        VALUES (?, ?, ?, ?)
    """, ("admin", password_hash, "admin@medease.com", "superadmin"))

    # =========================================================================
    # Sample Patients
    # =========================================================================
    patients = [
        {"name": "Maria Garcia", "date_of_birth": "1985-03-14"},
        {"name": "James Wilson", "date_of_birth": "1972-07-22"},
        {"name": "Aisha Patel", "date_of_birth": "1990-11-05"},
        {"name": "Robert Chang", "date_of_birth": "1968-01-30"},
        {"name": "Emily Thompson", "date_of_birth": "1995-06-18"},
        {"name": "Carlos Mendez", "date_of_birth": "1980-09-12"},
        {"name": "Sarah Kim", "date_of_birth": "1988-12-25"},
        {"name": "David O'Brien", "date_of_birth": "1975-04-07"},
        {"name": "Priya Sharma", "date_of_birth": "1992-08-19"},
        {"name": "Michael Johnson", "date_of_birth": "1965-02-28"},
    ]

    for pt in patients:
        cursor.execute(
            "INSERT INTO patients (name, date_of_birth) VALUES (?, ?)",
            (pt["name"], pt["date_of_birth"])
        )

    # patient IDs will be 1-10 (first patients in DB)

    # =========================================================================
    # Sample Appointments (mix of scheduled, completed, no_show across dates)
    # =========================================================================
    from datetime import date, timedelta
    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    two_days_ago = (date.today() - timedelta(days=2)).isoformat()
    last_week = (date.today() - timedelta(days=7)).isoformat()
    two_weeks_ago = (date.today() - timedelta(days=14)).isoformat()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    next_week = (date.today() + timedelta(days=7)).isoformat()
    in_two_weeks = (date.today() + timedelta(days=14)).isoformat()

    appointments = [
        # Doctor 1 (Sarah Chen, clinic 1) - patients 1,2,3,4
        {"patient_id": 1, "doctor_id": 1, "clinic_id": 1, "service_id": 1, "date": two_weeks_ago, "time": "09:00", "status": "completed", "notes": "Annual physical - all looks good"},
        {"patient_id": 1, "doctor_id": 1, "clinic_id": 1, "service_id": 3, "date": today, "time": "10:30", "status": "scheduled", "notes": "Follow-up on blood pressure"},
        {"patient_id": 2, "doctor_id": 1, "clinic_id": 1, "service_id": 2, "date": last_week, "time": "11:00", "status": "completed", "notes": "Sick visit - flu symptoms"},
        {"patient_id": 2, "doctor_id": 1, "clinic_id": 1, "service_id": 3, "date": tomorrow, "time": "14:00", "status": "scheduled", "notes": "Chronic disease follow-up"},
        {"patient_id": 3, "doctor_id": 1, "clinic_id": 1, "service_id": 1, "date": yesterday, "time": "09:30", "status": "completed", "notes": "Annual exam"},
        {"patient_id": 4, "doctor_id": 1, "clinic_id": 1, "service_id": 2, "date": two_days_ago, "time": "15:00", "status": "no_show", "notes": "Patient did not show"},

        # Doctor 2 (Michael Rodriguez, clinic 1) - patients 3,5,6
        {"patient_id": 3, "doctor_id": 2, "clinic_id": 1, "service_id": 4, "date": last_week, "time": "10:00", "status": "completed", "notes": "Flu vaccination"},
        {"patient_id": 5, "doctor_id": 2, "clinic_id": 1, "service_id": 2, "date": today, "time": "09:00", "status": "scheduled", "notes": "Knee pain evaluation"},
        {"patient_id": 6, "doctor_id": 2, "clinic_id": 1, "service_id": 1, "date": next_week, "time": "11:00", "status": "scheduled", "notes": "Annual physical exam"},

        # Doctor 3 (Jennifer Patel, clinic 2) - patients 5,7,9
        {"patient_id": 5, "doctor_id": 3, "clinic_id": 2, "service_id": 7, "date": two_weeks_ago, "time": "14:00", "status": "completed", "notes": "Wellness exam"},
        {"patient_id": 7, "doctor_id": 3, "clinic_id": 2, "service_id": 5, "date": last_week, "time": "10:00", "status": "completed", "notes": "New patient visit"},
        {"patient_id": 7, "doctor_id": 3, "clinic_id": 2, "service_id": 6, "date": today, "time": "11:00", "status": "scheduled", "notes": "Follow-up visit"},
        {"patient_id": 9, "doctor_id": 3, "clinic_id": 2, "service_id": 5, "date": yesterday, "time": "13:30", "status": "completed", "notes": "New patient intake"},

        # Doctor 4 (David Kim, clinic 2) - patients 6,8,10
        {"patient_id": 6, "doctor_id": 4, "clinic_id": 2, "service_id": 8, "date": two_weeks_ago, "time": "09:00", "status": "completed", "notes": "Diabetes management review"},
        {"patient_id": 8, "doctor_id": 4, "clinic_id": 2, "service_id": 8, "date": last_week, "time": "10:30", "status": "no_show", "notes": "Missed diabetes follow-up"},
        {"patient_id": 8, "doctor_id": 4, "clinic_id": 2, "service_id": 8, "date": today, "time": "14:30", "status": "scheduled", "notes": "Rescheduled diabetes follow-up"},
        {"patient_id": 10, "doctor_id": 4, "clinic_id": 2, "service_id": 6, "date": yesterday, "time": "15:00", "status": "completed", "notes": "Follow-up for metabolic panel"},
        {"patient_id": 10, "doctor_id": 4, "clinic_id": 2, "service_id": 8, "date": in_two_weeks, "time": "09:00", "status": "scheduled", "notes": "Quarterly diabetes check"},

        # Doctor 9 (Elizabeth O'Connor, clinic 5) - patients 2,4,10
        {"patient_id": 2, "doctor_id": 9, "clinic_id": 5, "service_id": 18, "date": two_weeks_ago, "time": "10:00", "status": "completed", "notes": "Cardiovascular risk assessment"},
        {"patient_id": 4, "doctor_id": 9, "clinic_id": 5, "service_id": 17, "date": last_week, "time": "09:00", "status": "completed", "notes": "Executive health exam"},
        {"patient_id": 10, "doctor_id": 9, "clinic_id": 5, "service_id": 20, "date": today, "time": "16:00", "status": "scheduled", "notes": "Medication review"},
    ]

    for apt in appointments:
        cursor.execute("""
            INSERT INTO appointments (patient_id, doctor_id, clinic_id, service_id,
                                     appointment_date, appointment_time, duration_minutes, status, notes)
            VALUES (?, ?, ?, ?, ?, ?, 30, ?, ?)
        """, (apt["patient_id"], apt["doctor_id"], apt["clinic_id"], apt["service_id"],
              apt["date"], apt["time"], apt["status"], apt["notes"]))

    # =========================================================================
    # Sample Vitals
    # =========================================================================
    vitals = [
        # Maria Garcia
        {"patient_id": 1, "recorded_by": 1, "heart_rate": 72, "systolic_bp": 138, "diastolic_bp": 88,
         "oxygen_level": 98.2, "temperature": 98.6, "respiratory_rate": 16, "weight": 145, "notes": "Slightly elevated BP"},
        {"patient_id": 1, "recorded_by": 1, "heart_rate": 70, "systolic_bp": 130, "diastolic_bp": 82,
         "oxygen_level": 98.5, "temperature": 98.4, "respiratory_rate": 15, "weight": 144, "notes": "BP improving"},
        # James Wilson
        {"patient_id": 2, "recorded_by": 1, "heart_rate": 88, "systolic_bp": 145, "diastolic_bp": 92,
         "oxygen_level": 97.0, "temperature": 100.2, "respiratory_rate": 20, "weight": 210, "notes": "Fever present, tachycardic"},
        {"patient_id": 2, "recorded_by": 9, "heart_rate": 78, "systolic_bp": 142, "diastolic_bp": 90,
         "oxygen_level": 97.8, "temperature": 98.7, "respiratory_rate": 17, "weight": 208, "notes": "Recovering from flu"},
        # Aisha Patel
        {"patient_id": 3, "recorded_by": 1, "heart_rate": 68, "systolic_bp": 118, "diastolic_bp": 76,
         "oxygen_level": 99.0, "temperature": 98.4, "respiratory_rate": 14, "weight": 130, "notes": "All vitals normal"},
        # Robert Chang
        {"patient_id": 4, "recorded_by": 9, "heart_rate": 82, "systolic_bp": 152, "diastolic_bp": 96,
         "oxygen_level": 96.5, "temperature": 98.6, "respiratory_rate": 18, "weight": 195, "notes": "HTN noted, needs monitoring"},
        # Carlos Mendez
        {"patient_id": 6, "recorded_by": 4, "heart_rate": 76, "systolic_bp": 128, "diastolic_bp": 80,
         "oxygen_level": 98.0, "temperature": 98.5, "respiratory_rate": 16, "weight": 180, "notes": "Stable vitals"},
        # David O'Brien
        {"patient_id": 8, "recorded_by": 4, "heart_rate": 90, "systolic_bp": 150, "diastolic_bp": 95,
         "oxygen_level": 97.2, "temperature": 98.8, "respiratory_rate": 18, "weight": 225, "notes": "Elevated BP, overweight"},
        # Michael Johnson
        {"patient_id": 10, "recorded_by": 4, "heart_rate": 74, "systolic_bp": 134, "diastolic_bp": 86,
         "oxygen_level": 97.5, "temperature": 98.6, "respiratory_rate": 16, "weight": 190, "notes": "Borderline hypertension"},
    ]

    for v in vitals:
        cursor.execute("""
            INSERT INTO vitals (patient_id, recorded_by, heart_rate, systolic_bp, diastolic_bp,
                               oxygen_level, temperature, respiratory_rate, weight, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (v["patient_id"], v["recorded_by"], v["heart_rate"], v["systolic_bp"], v["diastolic_bp"],
              v["oxygen_level"], v["temperature"], v["respiratory_rate"], v["weight"], v["notes"]))

    # =========================================================================
    # Sample Doctor Notes
    # =========================================================================
    doctor_notes = [
        {"doctor_id": 1, "patient_id": 1, "note_type": "text",
         "content": "Maria, your blood pressure has been trending down nicely. Keep up with the low-sodium diet and daily walks. Let's recheck at your next visit."},
        {"doctor_id": 1, "patient_id": 1, "note_type": "text",
         "content": "Adjusted lisinopril dosage from 10mg to 20mg. Please monitor for any dizziness and report back."},
        {"doctor_id": 1, "patient_id": 2, "note_type": "text",
         "content": "James, your flu test came back positive for Influenza A. Rest, fluids, and the prescribed Tamiflu should have you feeling better in 3-5 days. Call if fever persists beyond 3 days."},
        {"doctor_id": 1, "patient_id": 3, "note_type": "text",
         "content": "Aisha, all your lab results look excellent. Your cholesterol is well controlled. Continue current medication regimen. See you in 6 months."},
        {"doctor_id": 9, "patient_id": 4, "note_type": "text",
         "content": "Robert, your cardiovascular risk assessment shows moderate risk. I am recommending lifestyle modifications and starting a low-dose statin. Please review the attached diet plan."},
        {"doctor_id": 4, "patient_id": 6, "note_type": "text",
         "content": "Carlos, your A1C has come down to 6.8 from 7.4. Great improvement! Keep up with the metformin and dietary changes."},
        {"doctor_id": 3, "patient_id": 7, "note_type": "text",
         "content": "Sarah, welcome to our practice. Based on your intake, I would like to run a comprehensive panel. Please schedule your blood draw at your convenience."},
        {"doctor_id": 4, "patient_id": 8, "note_type": "text",
         "content": "David, I noticed you missed your last appointment. It is important we stay on track with your diabetes management. Please reschedule as soon as possible."},
        {"doctor_id": 4, "patient_id": 10, "note_type": "text",
         "content": "Michael, your metabolic panel shows improved kidney function. We will continue monitoring quarterly. Keep staying hydrated."},
    ]

    for note in doctor_notes:
        cursor.execute("""
            INSERT INTO doctor_notes (doctor_id, patient_id, note_type, content)
            VALUES (?, ?, ?, ?)
        """, (note["doctor_id"], note["patient_id"], note["note_type"], note["content"]))

    # =========================================================================
    # Sample Journal Entries (include several for today so stories show up)
    # =========================================================================
    now_ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    yesterday_ts = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")
    two_days_ago_ts = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d %H:%M:%S")
    three_days_ago_ts = (datetime.now() - timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S")

    journal_entries = [
        # TODAY entries - these will show up as stories
        {"patient_id": 1, "entry_text": "Feeling much better today. Took my blood pressure this morning and it was 128/82. The new medication seems to be working. Went for a 30-minute walk.",
         "mood": "good", "pain_level": 1, "symptoms": "mild headache", "created_at": now_ts},
        {"patient_id": 2, "entry_text": "Still recovering from the flu but my fever broke last night. Appetite is slowly coming back. Took all my medications on time today.",
         "mood": "okay", "pain_level": 3, "symptoms": "body aches, fatigue, mild cough", "created_at": now_ts},
        {"patient_id": 3, "entry_text": "Great day! Went for a run this morning and felt strong. No complaints at all. Excited about my clean lab results.",
         "mood": "great", "pain_level": 0, "symptoms": None, "created_at": now_ts},
        {"patient_id": 5, "entry_text": "Knee is still bothering me especially going up stairs. Icing it twice a day as recommended. Pain is about a 5 out of 10.",
         "mood": "okay", "pain_level": 5, "symptoms": "knee pain, stiffness in morning", "created_at": now_ts},
        {"patient_id": 6, "entry_text": "Checked my blood sugar after breakfast - 112. Sticking to the low carb meal plan. Feeling more energetic this week.",
         "mood": "good", "pain_level": 0, "symptoms": None, "created_at": now_ts},
        {"patient_id": 7, "entry_text": "First day journaling here! Had my new patient visit last week and Dr. Patel was wonderful. Waiting for my lab results. A little anxious about it.",
         "mood": "anxious", "pain_level": 0, "symptoms": "anxiety, trouble sleeping", "created_at": now_ts},
        {"patient_id": 8, "entry_text": "Missed my appointment again last week. I know I need to do better. Blood sugar has been running high - 180s after meals. Going to the rescheduled visit tomorrow.",
         "mood": "stressed", "pain_level": 2, "symptoms": "frequent urination, thirst", "created_at": now_ts},
        {"patient_id": 9, "entry_text": "Settling into the new practice. Had my intake yesterday and everything went smoothly. Taking my prenatal vitamins regularly.",
         "mood": "good", "pain_level": 0, "symptoms": "mild nausea in mornings", "created_at": now_ts},
        {"patient_id": 10, "entry_text": "Kidney numbers looking better per Dr. Kim. Drinking 8 glasses of water daily now. Feeling less fatigued than last month.",
         "mood": "good", "pain_level": 1, "symptoms": "mild fatigue", "created_at": now_ts},

        # PAST entries for history
        {"patient_id": 1, "entry_text": "Had a dizzy spell this morning after taking my new BP medication. Ate breakfast and it went away. Will mention to Dr. Chen.",
         "mood": "concerned", "pain_level": 2, "symptoms": "dizziness, lightheadedness", "created_at": yesterday_ts},
        {"patient_id": 1, "entry_text": "Blood pressure was 140/90 today. A bit frustrated that it is not coming down faster. Trying to reduce salt intake.",
         "mood": "frustrated", "pain_level": 1, "symptoms": "headache", "created_at": three_days_ago_ts},
        {"patient_id": 2, "entry_text": "Fever hit 102 today. Whole body aches. Started Tamiflu as prescribed. Wife is making chicken soup.",
         "mood": "terrible", "pain_level": 7, "symptoms": "high fever, body aches, chills, sore throat", "created_at": yesterday_ts},
        {"patient_id": 5, "entry_text": "Knee swelled up after trying to jog. Need to stick to low-impact exercise for now. Using the brace Dr. Rodriguez recommended.",
         "mood": "frustrated", "pain_level": 6, "symptoms": "knee swelling, pain with movement", "created_at": two_days_ago_ts},
        {"patient_id": 6, "entry_text": "A1C results came in - 6.8! Down from 7.4! The diet changes are really paying off. Celebrated with a sugar-free dessert.",
         "mood": "excited", "pain_level": 0, "symptoms": None, "created_at": yesterday_ts},
        {"patient_id": 8, "entry_text": "Blood sugar was 210 after dinner. I know I had too many carbs. Need to plan meals better.",
         "mood": "guilty", "pain_level": 0, "symptoms": "blurred vision, thirst", "created_at": two_days_ago_ts},
    ]

    for je in journal_entries:
        cursor.execute("""
            INSERT INTO journal_entries (patient_id, entry_text, mood, pain_level, symptoms, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (je["patient_id"], je["entry_text"], je["mood"], je["pain_level"], je["symptoms"], je["created_at"]))

    # =========================================================================
    # Sample Billing Records
    # =========================================================================
    billing_records = [
        {"patient_id": 1, "appointment_id": 1, "description": "Annual Physical Exam", "amount": 150.00,
         "insurance_covered": 120.00, "patient_responsibility": 30.00, "status": "paid"},
        {"patient_id": 1, "appointment_id": 2, "description": "Follow-up Visit - Hypertension", "amount": 125.00,
         "insurance_covered": 100.00, "patient_responsibility": 25.00, "status": "pending"},
        {"patient_id": 2, "appointment_id": 3, "description": "Sick Visit - Influenza", "amount": 100.00,
         "insurance_covered": 80.00, "patient_responsibility": 20.00, "status": "paid"},
        {"patient_id": 3, "appointment_id": 5, "description": "Annual Physical Exam", "amount": 150.00,
         "insurance_covered": 150.00, "patient_responsibility": 0.00, "status": "paid"},
        {"patient_id": 3, "appointment_id": 7, "description": "Flu Vaccination", "amount": 50.00,
         "insurance_covered": 50.00, "patient_responsibility": 0.00, "status": "paid"},
        {"patient_id": 4, "appointment_id": 20, "description": "Executive Health Exam", "amount": 500.00,
         "insurance_covered": 350.00, "patient_responsibility": 150.00, "status": "pending"},
        {"patient_id": 5, "appointment_id": 10, "description": "Women's Wellness Exam", "amount": 175.00,
         "insurance_covered": 140.00, "patient_responsibility": 35.00, "status": "paid"},
        {"patient_id": 6, "appointment_id": 14, "description": "Diabetes Care Visit", "amount": 125.00,
         "insurance_covered": 100.00, "patient_responsibility": 25.00, "status": "paid"},
        {"patient_id": 7, "appointment_id": 11, "description": "New Patient Visit", "amount": 200.00,
         "insurance_covered": 160.00, "patient_responsibility": 40.00, "status": "pending"},
        {"patient_id": 8, "appointment_id": 16, "description": "Diabetes Care Visit", "amount": 125.00,
         "insurance_covered": 0.00, "patient_responsibility": 125.00, "status": "pending"},
        {"patient_id": 9, "appointment_id": 13, "description": "New Patient Visit", "amount": 200.00,
         "insurance_covered": 170.00, "patient_responsibility": 30.00, "status": "paid"},
        {"patient_id": 10, "appointment_id": 17, "description": "Follow-up Visit - Metabolic", "amount": 100.00,
         "insurance_covered": 80.00, "patient_responsibility": 20.00, "status": "paid"},
        {"patient_id": 2, "appointment_id": 19, "description": "Cardiovascular Risk Assessment", "amount": 225.00,
         "insurance_covered": 180.00, "patient_responsibility": 45.00, "status": "pending"},
    ]

    for bill in billing_records:
        cursor.execute("""
            INSERT INTO billing (patient_id, appointment_id, description, amount,
                                insurance_covered, patient_responsibility, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (bill["patient_id"], bill["appointment_id"], bill["description"], bill["amount"],
              bill["insurance_covered"], bill["patient_responsibility"], bill["status"]))

    # =========================================================================
    # Sample Insurance
    # =========================================================================
    insurance_records = [
        {"patient_id": 1, "provider_name": "Blue Shield of California", "policy_number": "BSC-2024-88901",
         "group_number": "GRP-4412", "copay": 30.00, "deductible": 1500.00},
        {"patient_id": 2, "provider_name": "Aetna", "policy_number": "AET-2024-55234",
         "group_number": "GRP-7788", "copay": 25.00, "deductible": 2000.00},
        {"patient_id": 3, "provider_name": "Kaiser Permanente", "policy_number": "KP-2024-11567",
         "group_number": "GRP-2200", "copay": 20.00, "deductible": 500.00},
        {"patient_id": 5, "provider_name": "UnitedHealthcare", "policy_number": "UHC-2024-33890",
         "group_number": "GRP-5500", "copay": 35.00, "deductible": 2500.00},
        {"patient_id": 6, "provider_name": "Cigna", "policy_number": "CIG-2024-77123",
         "group_number": "GRP-9100", "copay": 25.00, "deductible": 1000.00},
        {"patient_id": 7, "provider_name": "Blue Shield of California", "policy_number": "BSC-2024-44567",
         "group_number": "GRP-4412", "copay": 30.00, "deductible": 1500.00},
        {"patient_id": 9, "provider_name": "Anthem Blue Cross", "policy_number": "ABC-2024-66789",
         "group_number": "GRP-3300", "copay": 20.00, "deductible": 750.00},
        {"patient_id": 10, "provider_name": "Aetna", "policy_number": "AET-2024-99012",
         "group_number": "GRP-7788", "copay": 25.00, "deductible": 2000.00},
    ]

    for ins in insurance_records:
        cursor.execute("""
            INSERT INTO insurance (patient_id, provider_name, policy_number, group_number, copay, deductible)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (ins["patient_id"], ins["provider_name"], ins["policy_number"],
              ins["group_number"], ins["copay"], ins["deductible"]))

    # =========================================================================
    # Sample Prescriptions
    # =========================================================================
    prescriptions = [
        {"patient_id": 1, "doctor_id": 1, "medication_name": "Lisinopril", "dosage": "20mg",
         "frequency": "Once daily", "quantity": 30, "refills": 5,
         "instructions": "Take one tablet by mouth every morning. Monitor blood pressure daily.",
         "pharmacy": "CVS Pharmacy - Santa Clara"},
        {"patient_id": 1, "doctor_id": 1, "medication_name": "Amlodipine", "dosage": "5mg",
         "frequency": "Once daily", "quantity": 30, "refills": 5,
         "instructions": "Take one tablet by mouth in the evening.",
         "pharmacy": "CVS Pharmacy - Santa Clara"},
        {"patient_id": 2, "doctor_id": 1, "medication_name": "Oseltamivir (Tamiflu)", "dosage": "75mg",
         "frequency": "Twice daily", "quantity": 10, "refills": 0,
         "instructions": "Take one capsule twice daily for 5 days. Complete full course.",
         "pharmacy": "Walgreens - San Jose"},
        {"patient_id": 2, "doctor_id": 9, "medication_name": "Atorvastatin", "dosage": "20mg",
         "frequency": "Once daily at bedtime", "quantity": 30, "refills": 11,
         "instructions": "Take one tablet at bedtime. Avoid grapefruit juice.",
         "pharmacy": "Walgreens - San Jose"},
        {"patient_id": 4, "doctor_id": 9, "medication_name": "Rosuvastatin", "dosage": "10mg",
         "frequency": "Once daily", "quantity": 30, "refills": 5,
         "instructions": "Take one tablet daily. May take with or without food.",
         "pharmacy": "Rite Aid - San Francisco"},
        {"patient_id": 4, "doctor_id": 9, "medication_name": "Aspirin", "dosage": "81mg",
         "frequency": "Once daily", "quantity": 90, "refills": 3,
         "instructions": "Take one low-dose aspirin daily with food.",
         "pharmacy": "Rite Aid - San Francisco"},
        {"patient_id": 6, "doctor_id": 4, "medication_name": "Metformin", "dosage": "1000mg",
         "frequency": "Twice daily", "quantity": 60, "refills": 5,
         "instructions": "Take one tablet with breakfast and one with dinner. Take with food to reduce stomach upset.",
         "pharmacy": "CVS Pharmacy - San Jose"},
        {"patient_id": 8, "doctor_id": 4, "medication_name": "Metformin", "dosage": "500mg",
         "frequency": "Twice daily", "quantity": 60, "refills": 5,
         "instructions": "Take one tablet with breakfast and one with dinner.",
         "pharmacy": "Walgreens - San Jose"},
        {"patient_id": 8, "doctor_id": 4, "medication_name": "Glipizide", "dosage": "5mg",
         "frequency": "Once daily before breakfast", "quantity": 30, "refills": 5,
         "instructions": "Take 30 minutes before breakfast. Watch for signs of low blood sugar.",
         "pharmacy": "Walgreens - San Jose"},
        {"patient_id": 10, "doctor_id": 4, "medication_name": "Lisinopril", "dosage": "10mg",
         "frequency": "Once daily", "quantity": 30, "refills": 5,
         "instructions": "Take one tablet daily. Stay hydrated. Report any swelling.",
         "pharmacy": "CVS Pharmacy - San Jose"},
    ]

    for rx in prescriptions:
        cursor.execute("""
            INSERT INTO prescriptions (patient_id, doctor_id, medication_name, dosage, frequency,
                                       quantity, refills, instructions, pharmacy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (rx["patient_id"], rx["doctor_id"], rx["medication_name"], rx["dosage"], rx["frequency"],
              rx["quantity"], rx["refills"], rx["instructions"], rx["pharmacy"]))

    # =========================================================================
    # Sample Lab Results
    # =========================================================================
    lab_results = [
        # Maria Garcia - blood work
        {"patient_id": 1, "ordered_by": 1, "lab_type": "Blood", "test_name": "Complete Blood Count (CBC)",
         "result_value": "Normal", "unit": None, "reference_range": "See components", "is_abnormal": 0,
         "notes": "All CBC components within normal limits", "status": "completed"},
        {"patient_id": 1, "ordered_by": 1, "lab_type": "Blood", "test_name": "Basic Metabolic Panel",
         "result_value": "Normal", "unit": None, "reference_range": "See components", "is_abnormal": 0,
         "notes": "Electrolytes and kidney function normal", "status": "completed"},
        {"patient_id": 1, "ordered_by": 1, "lab_type": "Blood", "test_name": "HbA1c",
         "result_value": "5.6", "unit": "%", "reference_range": "< 5.7", "is_abnormal": 0,
         "notes": "Normal - not diabetic", "status": "completed"},

        # James Wilson
        {"patient_id": 2, "ordered_by": 1, "lab_type": "Blood", "test_name": "Influenza A/B Rapid Test",
         "result_value": "Positive - Influenza A", "unit": None, "reference_range": "Negative", "is_abnormal": 1,
         "notes": "Positive for Influenza A. Started antiviral treatment.", "status": "completed"},
        {"patient_id": 2, "ordered_by": 9, "lab_type": "Blood", "test_name": "Lipid Panel",
         "result_value": "Total: 242", "unit": "mg/dL", "reference_range": "< 200", "is_abnormal": 1,
         "notes": "Elevated total cholesterol. LDL 155, HDL 42, Triglycerides 225", "status": "completed"},

        # Aisha Patel
        {"patient_id": 3, "ordered_by": 1, "lab_type": "Blood", "test_name": "Lipid Panel",
         "result_value": "Total: 185", "unit": "mg/dL", "reference_range": "< 200", "is_abnormal": 0,
         "notes": "Excellent lipid profile. LDL 98, HDL 65, Triglycerides 110", "status": "completed"},
        {"patient_id": 3, "ordered_by": 1, "lab_type": "Blood", "test_name": "Thyroid Panel (TSH)",
         "result_value": "2.1", "unit": "mIU/L", "reference_range": "0.4 - 4.0", "is_abnormal": 0,
         "notes": "Thyroid function normal", "status": "completed"},

        # Robert Chang
        {"patient_id": 4, "ordered_by": 9, "lab_type": "Blood", "test_name": "Lipid Panel",
         "result_value": "Total: 260", "unit": "mg/dL", "reference_range": "< 200", "is_abnormal": 1,
         "notes": "High cholesterol. LDL 172, HDL 38. Statin recommended.", "status": "completed"},
        {"patient_id": 4, "ordered_by": 9, "lab_type": "Blood", "test_name": "C-Reactive Protein (CRP)",
         "result_value": "3.8", "unit": "mg/L", "reference_range": "< 3.0", "is_abnormal": 1,
         "notes": "Mildly elevated inflammatory marker", "status": "completed"},

        # Carlos Mendez
        {"patient_id": 6, "ordered_by": 4, "lab_type": "Blood", "test_name": "HbA1c",
         "result_value": "6.8", "unit": "%", "reference_range": "< 7.0 (diabetic target)", "is_abnormal": 0,
         "notes": "At target. Improved from 7.4 three months ago.", "status": "completed"},
        {"patient_id": 6, "ordered_by": 4, "lab_type": "Blood", "test_name": "Fasting Glucose",
         "result_value": "128", "unit": "mg/dL", "reference_range": "70 - 130 (diabetic target)", "is_abnormal": 0,
         "notes": "Within diabetic target range", "status": "completed"},

        # Sarah Kim - pending labs
        {"patient_id": 7, "ordered_by": 3, "lab_type": "Blood", "test_name": "Comprehensive Metabolic Panel",
         "result_value": None, "unit": None, "reference_range": None, "is_abnormal": 0,
         "notes": "Ordered during new patient visit. Awaiting results.", "status": "pending"},
        {"patient_id": 7, "ordered_by": 3, "lab_type": "Blood", "test_name": "Complete Blood Count (CBC)",
         "result_value": None, "unit": None, "reference_range": None, "is_abnormal": 0,
         "notes": "Ordered during new patient visit. Awaiting results.", "status": "pending"},

        # David O'Brien
        {"patient_id": 8, "ordered_by": 4, "lab_type": "Blood", "test_name": "HbA1c",
         "result_value": "8.2", "unit": "%", "reference_range": "< 7.0 (diabetic target)", "is_abnormal": 1,
         "notes": "Above target. Medication adjustment may be needed.", "status": "completed"},
        {"patient_id": 8, "ordered_by": 4, "lab_type": "Blood", "test_name": "Fasting Glucose",
         "result_value": "185", "unit": "mg/dL", "reference_range": "70 - 130 (diabetic target)", "is_abnormal": 1,
         "notes": "Elevated. Correlates with poor A1c control.", "status": "completed"},

        # Michael Johnson
        {"patient_id": 10, "ordered_by": 4, "lab_type": "Blood", "test_name": "Basic Metabolic Panel",
         "result_value": "Normal", "unit": None, "reference_range": "See components", "is_abnormal": 0,
         "notes": "Kidney function improved. Creatinine 1.1 (was 1.4)", "status": "completed"},
        {"patient_id": 10, "ordered_by": 4, "lab_type": "Blood", "test_name": "eGFR",
         "result_value": "72", "unit": "mL/min/1.73m2", "reference_range": "> 60", "is_abnormal": 0,
         "notes": "Improved from 58 last quarter. Continue hydration.", "status": "completed"},
        {"patient_id": 10, "ordered_by": 9, "lab_type": "Blood", "test_name": "Lipid Panel",
         "result_value": "Total: 198", "unit": "mg/dL", "reference_range": "< 200", "is_abnormal": 0,
         "notes": "Borderline. LDL 120, HDL 48. Lifestyle modifications recommended.", "status": "completed"},
    ]

    for lab in lab_results:
        cursor.execute("""
            INSERT INTO lab_results (patient_id, ordered_by, lab_type, test_name, result_value,
                                     unit, reference_range, is_abnormal, notes, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (lab["patient_id"], lab["ordered_by"], lab["lab_type"], lab["test_name"],
              lab["result_value"], lab["unit"], lab["reference_range"], lab["is_abnormal"],
              lab["notes"], lab["status"]))

    print("Sample data seeded successfully!")


# =============================================================================
# Patient Operations
# =============================================================================

def create_patient(name: str, date_of_birth: Optional[str] = None) -> int:
    """Create a new patient and return their ID."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO patients (name, date_of_birth) VALUES (?, ?)",
            (name, date_of_birth)
        )
        return cursor.lastrowid


def get_patient(patient_id: int) -> Optional[Dict]:
    """Get a patient by ID."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM patients WHERE id = ?", (patient_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def get_patient_by_name(name: str) -> Optional[Dict]:
    """Get a patient by name (case-insensitive partial match)."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM patients WHERE LOWER(name) LIKE LOWER(?) ORDER BY created_at DESC LIMIT 1",
            (f"%{name}%",)
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def get_all_patients() -> List[Dict]:
    """Get all patients."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM patients ORDER BY created_at DESC")
        return [dict(row) for row in cursor.fetchall()]


def search_patients(query: str) -> List[Dict]:
    """Search patients by name."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM patients WHERE LOWER(name) LIKE LOWER(?) ORDER BY created_at DESC",
            (f"%{query}%",)
        )
        return [dict(row) for row in cursor.fetchall()]


# =============================================================================
# Summary Operations
# =============================================================================

def create_summary(
    patient_id: int,
    raw_summary: str,
    file_path: Optional[str] = None,
    original_filename: Optional[str] = None,
    diagnosis: Optional[str] = None,
    visit_date: Optional[str] = None,
    visit_location: Optional[str] = None,
    next_steps: Optional[str] = None,
    warning_signs: Optional[str] = None
) -> int:
    """Create a new summary and return its ID."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO summaries
            (patient_id, raw_summary, file_path, original_filename, diagnosis,
             visit_date, visit_location, next_steps, warning_signs)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (patient_id, raw_summary, file_path, original_filename, diagnosis,
              visit_date, visit_location, next_steps, warning_signs))
        return cursor.lastrowid


def get_summary(summary_id: int) -> Optional[Dict]:
    """Get a summary by ID with all related data."""
    with get_db() as conn:
        cursor = conn.cursor()

        # Get summary
        cursor.execute("SELECT * FROM summaries WHERE id = ?", (summary_id,))
        summary = cursor.fetchone()
        if not summary:
            return None

        summary_dict = dict(summary)

        # Get medications
        cursor.execute("SELECT * FROM medications WHERE summary_id = ?", (summary_id,))
        summary_dict['medications'] = [dict(row) for row in cursor.fetchall()]

        # Get test results
        cursor.execute("SELECT * FROM test_results WHERE summary_id = ?", (summary_id,))
        summary_dict['test_results'] = [dict(row) for row in cursor.fetchall()]

        # Get interactions
        cursor.execute("SELECT * FROM drug_interactions WHERE summary_id = ?", (summary_id,))
        summary_dict['interactions'] = [dict(row) for row in cursor.fetchall()]

        return summary_dict


def get_patient_summaries(patient_id: int) -> List[Dict]:
    """Get all summaries for a patient."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM summaries WHERE patient_id = ? ORDER BY created_at DESC",
            (patient_id,)
        )
        return [dict(row) for row in cursor.fetchall()]


def get_all_summaries(limit: int = 50) -> List[Dict]:
    """Get all summaries with patient info."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.*, p.name as patient_name
            FROM summaries s
            LEFT JOIN patients p ON s.patient_id = p.id
            ORDER BY s.created_at DESC
            LIMIT ?
        """, (limit,))
        return [dict(row) for row in cursor.fetchall()]


def get_recent_summaries(limit: int = 10) -> List[Dict]:
    """Get recent summaries for dashboard."""
    return get_all_summaries(limit)


# =============================================================================
# Medication Operations
# =============================================================================

def add_medication(
    summary_id: int,
    name: str,
    dosage: Optional[str] = None,
    frequency: Optional[str] = None,
    purpose: Optional[str] = None,
    rxcui: Optional[str] = None,
    drug_class: Optional[str] = None
) -> int:
    """Add a medication to a summary."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO medications
            (summary_id, name, dosage, frequency, purpose, rxcui, drug_class)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (summary_id, name, dosage, frequency, purpose, rxcui, drug_class))
        return cursor.lastrowid


def get_all_medications() -> List[Dict]:
    """Get all medications across all summaries."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT m.*, s.patient_id, p.name as patient_name
            FROM medications m
            JOIN summaries s ON m.summary_id = s.id
            LEFT JOIN patients p ON s.patient_id = p.id
            ORDER BY m.created_at DESC
        """)
        return [dict(row) for row in cursor.fetchall()]


# =============================================================================
# Test Results Operations
# =============================================================================

def add_test_result(
    summary_id: int,
    test_name: str,
    value: Optional[str] = None,
    unit: Optional[str] = None,
    reference_range: Optional[str] = None,
    status: Optional[str] = None
) -> int:
    """Add a test result to a summary."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO test_results
            (summary_id, test_name, value, unit, reference_range, status)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (summary_id, test_name, value, unit, reference_range, status))
        return cursor.lastrowid


# =============================================================================
# Drug Interaction Operations
# =============================================================================

def add_drug_interaction(
    summary_id: int,
    drug1: str,
    drug2: str,
    severity: Optional[str] = None,
    description: Optional[str] = None,
    recommendation: Optional[str] = None
) -> int:
    """Add a drug interaction to a summary."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO drug_interactions
            (summary_id, drug1, drug2, severity, description, recommendation)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (summary_id, drug1, drug2, severity, description, recommendation))
        return cursor.lastrowid


# =============================================================================
# Chat Operations
# =============================================================================

def save_chat_message(
    session_id: str,
    chat_type: str,
    role: str,
    content: str,
    patient_id: Optional[int] = None,
    summary_id: Optional[int] = None
) -> int:
    """Save a chat message."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO chat_messages
            (session_id, chat_type, patient_id, summary_id, role, content)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (session_id, chat_type, patient_id, summary_id, role, content))
        return cursor.lastrowid


def get_chat_history(session_id: str, limit: int = 50) -> List[Dict]:
    """Get chat history for a session."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM chat_messages
            WHERE session_id = ?
            ORDER BY created_at ASC
            LIMIT ?
        """, (session_id, limit))
        return [dict(row) for row in cursor.fetchall()]


def get_patient_chat_history(patient_id: int, limit: int = 50) -> List[Dict]:
    """Get all chat history for a patient."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM chat_messages
            WHERE patient_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        """, (patient_id, limit))
        return [dict(row) for row in cursor.fetchall()]


# =============================================================================
# Analytics Operations
# =============================================================================

def log_analytics_event(event_type: str, event_data: Optional[str] = None):
    """Log an analytics event."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO analytics (event_type, event_data) VALUES (?, ?)",
            (event_type, event_data)
        )


def get_dashboard_stats() -> Dict[str, Any]:
    """Get statistics for the dashboard."""
    with get_db() as conn:
        cursor = conn.cursor()

        # Total patients
        cursor.execute("SELECT COUNT(*) as count FROM patients")
        total_patients = cursor.fetchone()['count']

        # Total summaries
        cursor.execute("SELECT COUNT(*) as count FROM summaries")
        total_summaries = cursor.fetchone()['count']

        # Total medications tracked
        cursor.execute("SELECT COUNT(*) as count FROM medications")
        total_medications = cursor.fetchone()['count']

        # Total interactions found
        cursor.execute("SELECT COUNT(*) as count FROM drug_interactions")
        total_interactions = cursor.fetchone()['count']

        # High risk cases (severe interactions)
        cursor.execute("""
            SELECT COUNT(DISTINCT summary_id) as count
            FROM drug_interactions
            WHERE LOWER(severity) = 'severe'
        """)
        high_risk_cases = cursor.fetchone()['count']

        # Medications by class
        cursor.execute("""
            SELECT drug_class, COUNT(*) as count
            FROM medications
            WHERE drug_class IS NOT NULL AND drug_class != ''
            GROUP BY drug_class
            ORDER BY count DESC
            LIMIT 10
        """)
        medications_by_class = [dict(row) for row in cursor.fetchall()]

        # Recent activity
        cursor.execute("""
            SELECT s.id, s.created_at, p.name as patient_name, s.diagnosis
            FROM summaries s
            LEFT JOIN patients p ON s.patient_id = p.id
            ORDER BY s.created_at DESC
            LIMIT 10
        """)
        recent_activity = [dict(row) for row in cursor.fetchall()]

        # Interactions by severity
        cursor.execute("""
            SELECT severity, COUNT(*) as count
            FROM drug_interactions
            GROUP BY severity
        """)
        interactions_by_severity = [dict(row) for row in cursor.fetchall()]

        return {
            "total_patients": total_patients,
            "total_summaries": total_summaries,
            "total_medications": total_medications,
            "total_interactions": total_interactions,
            "high_risk_cases": high_risk_cases,
            "medications_by_class": medications_by_class,
            "recent_activity": recent_activity,
            "interactions_by_severity": interactions_by_severity
        }


# =============================================================================
# Consultation Operations
# =============================================================================

def create_consultation_session(session_id: str, patient_id: Optional[int] = None) -> int:
    """Create a new consultation session."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO consultation_sessions (session_id, patient_id)
            VALUES (?, ?)
        """, (session_id, patient_id))
        return cursor.lastrowid


def get_consultation_session(session_id: str) -> Optional[Dict]:
    """Get a consultation session by session_id."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM consultation_sessions WHERE session_id = ?",
            (session_id,)
        )
        row = cursor.fetchone()
        if row:
            session = dict(row)
            # Get fields
            session['fields'] = get_consultation_fields(session_id)
            return session
        return None


def update_consultation_session(
    session_id: str,
    status: Optional[str] = None,
    is_emergency: Optional[bool] = None,
    patient_id: Optional[int] = None
):
    """Update a consultation session."""
    with get_db() as conn:
        cursor = conn.cursor()
        updates = ["updated_at = CURRENT_TIMESTAMP"]
        params = []

        if status:
            updates.append("status = ?")
            params.append(status)
            if status == 'completed':
                updates.append("completed_at = CURRENT_TIMESTAMP")

        if is_emergency is not None:
            updates.append("is_emergency = ?")
            params.append(1 if is_emergency else 0)

        if patient_id:
            updates.append("patient_id = ?")
            params.append(patient_id)

        params.append(session_id)
        cursor.execute(f"""
            UPDATE consultation_sessions
            SET {', '.join(updates)}
            WHERE session_id = ?
        """, params)


def save_consultation_field(
    session_id: str,
    field_name: str,
    field_label: str,
    field_value: str,
    confirmed: bool = False
) -> int:
    """Save or update a consultation field."""
    with get_db() as conn:
        cursor = conn.cursor()
        # Check if field exists
        cursor.execute("""
            SELECT id FROM consultation_fields
            WHERE session_id = ? AND field_name = ?
        """, (session_id, field_name))
        existing = cursor.fetchone()

        if existing:
            # Update existing field
            cursor.execute("""
                UPDATE consultation_fields
                SET field_value = ?, field_label = ?, confirmed = ?, updated_at = CURRENT_TIMESTAMP
                WHERE session_id = ? AND field_name = ?
            """, (field_value, field_label, 1 if confirmed else 0, session_id, field_name))
            return existing['id']
        else:
            # Insert new field
            cursor.execute("""
                INSERT INTO consultation_fields
                (session_id, field_name, field_label, field_value, confirmed)
                VALUES (?, ?, ?, ?, ?)
            """, (session_id, field_name, field_label, field_value, 1 if confirmed else 0))
            return cursor.lastrowid


def confirm_consultation_field(session_id: str, field_name: str) -> bool:
    """Mark a consultation field as confirmed."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE consultation_fields
            SET confirmed = 1, updated_at = CURRENT_TIMESTAMP
            WHERE session_id = ? AND field_name = ?
        """, (session_id, field_name))
        return cursor.rowcount > 0


def update_consultation_field(session_id: str, field_name: str, new_value: str) -> bool:
    """Update a consultation field value."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE consultation_fields
            SET field_value = ?, confirmed = 1, updated_at = CURRENT_TIMESTAMP
            WHERE session_id = ? AND field_name = ?
        """, (new_value, session_id, field_name))
        return cursor.rowcount > 0


def get_consultation_fields(session_id: str) -> List[Dict]:
    """Get all fields for a consultation session."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM consultation_fields
            WHERE session_id = ?
            ORDER BY created_at ASC
        """, (session_id,))
        return [dict(row) for row in cursor.fetchall()]


def get_all_consultations(limit: int = 50) -> List[Dict]:
    """Get all consultation sessions."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT cs.*, p.name as patient_name,
                   (SELECT COUNT(*) FROM consultation_fields cf WHERE cf.session_id = cs.session_id) as field_count
            FROM consultation_sessions cs
            LEFT JOIN patients p ON cs.patient_id = p.id
            ORDER BY cs.created_at DESC
            LIMIT ?
        """, (limit,))
        return [dict(row) for row in cursor.fetchall()]


# =============================================================================
# Clinic Operations
# =============================================================================

def get_all_clinics(active_only: bool = True) -> List[Dict]:
    """Get all clinics."""
    with get_db() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM clinics"
        if active_only:
            query += " WHERE is_active = 1"
        query += " ORDER BY name"
        cursor.execute(query)
        return [dict(row) for row in cursor.fetchall()]


def get_clinic(clinic_id: int) -> Optional[Dict]:
    """Get a clinic by ID with its doctors and services."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM clinics WHERE id = ?", (clinic_id,))
        clinic = cursor.fetchone()
        if not clinic:
            return None

        clinic_dict = dict(clinic)

        # Get doctors
        cursor.execute("""
            SELECT * FROM doctors WHERE clinic_id = ? AND is_active = 1
            ORDER BY last_name
        """, (clinic_id,))
        clinic_dict['doctors'] = [dict(row) for row in cursor.fetchall()]

        # Get services
        cursor.execute("""
            SELECT * FROM clinic_services WHERE clinic_id = ? AND is_active = 1
            ORDER BY category, service_name
        """, (clinic_id,))
        clinic_dict['services'] = [dict(row) for row in cursor.fetchall()]

        return clinic_dict


def create_clinic(
    name: str,
    address: Optional[str] = None,
    city: Optional[str] = None,
    state: Optional[str] = None,
    zip_code: Optional[str] = None,
    phone: Optional[str] = None,
    email: Optional[str] = None,
    website: Optional[str] = None,
    description: Optional[str] = None,
    operating_hours: Optional[str] = None
) -> int:
    """Create a new clinic."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO clinics (name, address, city, state, zip_code, phone, email, website, description, operating_hours)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (name, address, city, state, zip_code, phone, email, website, description, operating_hours))
        return cursor.lastrowid


def update_clinic(clinic_id: int, **kwargs) -> bool:
    """Update a clinic's information."""
    if not kwargs:
        return False

    with get_db() as conn:
        cursor = conn.cursor()
        fields = []
        values = []
        for key, value in kwargs.items():
            if key in ['name', 'address', 'city', 'state', 'zip_code', 'phone',
                       'email', 'website', 'description', 'operating_hours', 'logo_url', 'is_active']:
                fields.append(f"{key} = ?")
                values.append(value)

        if not fields:
            return False

        fields.append("updated_at = CURRENT_TIMESTAMP")
        values.append(clinic_id)

        cursor.execute(f"""
            UPDATE clinics SET {', '.join(fields)} WHERE id = ?
        """, values)
        return cursor.rowcount > 0


# =============================================================================
# Doctor Operations
# =============================================================================

def get_all_doctors(active_only: bool = True) -> List[Dict]:
    """Get all doctors with their clinic info."""
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT d.*, c.name as clinic_name
            FROM doctors d
            LEFT JOIN clinics c ON d.clinic_id = c.id
        """
        if active_only:
            query += " WHERE d.is_active = 1"
        query += " ORDER BY d.last_name, d.first_name"
        cursor.execute(query)
        return [dict(row) for row in cursor.fetchall()]


def get_doctor(doctor_id: int) -> Optional[Dict]:
    """Get a doctor by ID."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT d.*, c.name as clinic_name
            FROM doctors d
            LEFT JOIN clinics c ON d.clinic_id = c.id
            WHERE d.id = ?
        """, (doctor_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def get_doctors_by_clinic(clinic_id: int) -> List[Dict]:
    """Get all doctors for a specific clinic."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM doctors WHERE clinic_id = ? AND is_active = 1
            ORDER BY last_name, first_name
        """, (clinic_id,))
        return [dict(row) for row in cursor.fetchall()]


def get_doctors_by_specialty(specialty: str) -> List[Dict]:
    """Get all doctors by specialty."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT d.*, c.name as clinic_name
            FROM doctors d
            LEFT JOIN clinics c ON d.clinic_id = c.id
            WHERE LOWER(d.specialty) LIKE LOWER(?) AND d.is_active = 1
            ORDER BY d.last_name
        """, (f"%{specialty}%",))
        return [dict(row) for row in cursor.fetchall()]


def create_doctor(
    first_name: str,
    last_name: str,
    clinic_id: Optional[int] = None,
    title: str = "MD",
    specialty: Optional[str] = None,
    sub_specialty: Optional[str] = None,
    npi_number: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    bio: Optional[str] = None,
    languages: str = "English",
    education: Optional[str] = None,
    certifications: Optional[str] = None
) -> int:
    """Create a new doctor."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO doctors (clinic_id, first_name, last_name, title, specialty, sub_specialty,
                               npi_number, email, phone, bio, languages, education, certifications)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (clinic_id, first_name, last_name, title, specialty, sub_specialty,
              npi_number, email, phone, bio, languages, education, certifications))
        return cursor.lastrowid


def update_doctor(doctor_id: int, **kwargs) -> bool:
    """Update a doctor's information."""
    if not kwargs:
        return False

    with get_db() as conn:
        cursor = conn.cursor()
        fields = []
        values = []
        valid_fields = ['clinic_id', 'first_name', 'last_name', 'title', 'specialty',
                        'sub_specialty', 'npi_number', 'license_number', 'email', 'phone',
                        'bio', 'photo_url', 'accepting_patients', 'languages',
                        'education', 'certifications', 'is_active']

        for key, value in kwargs.items():
            if key in valid_fields:
                fields.append(f"{key} = ?")
                values.append(value)

        if not fields:
            return False

        fields.append("updated_at = CURRENT_TIMESTAMP")
        values.append(doctor_id)

        cursor.execute(f"""
            UPDATE doctors SET {', '.join(fields)} WHERE id = ?
        """, values)
        return cursor.rowcount > 0


# =============================================================================
# Clinic Services Operations
# =============================================================================

def get_clinic_services(clinic_id: int) -> List[Dict]:
    """Get all services for a clinic."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM clinic_services
            WHERE clinic_id = ? AND is_active = 1
            ORDER BY category, service_name
        """, (clinic_id,))
        return [dict(row) for row in cursor.fetchall()]


def create_clinic_service(
    clinic_id: int,
    service_name: str,
    description: Optional[str] = None,
    category: Optional[str] = None,
    duration_minutes: int = 30,
    price: Optional[float] = None
) -> int:
    """Create a new clinic service."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO clinic_services (clinic_id, service_name, description, category, duration_minutes, price)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (clinic_id, service_name, description, category, duration_minutes, price))
        return cursor.lastrowid


# =============================================================================
# Admin User Operations
# =============================================================================

def verify_admin_login(username: str, password: str) -> Optional[Dict]:
    """Verify admin login credentials."""
    import hashlib
    password_hash = hashlib.sha256(password.encode()).hexdigest()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, username, email, role, clinic_id
            FROM admin_users
            WHERE username = ? AND password_hash = ? AND is_active = 1
        """, (username, password_hash))
        user = cursor.fetchone()

        if user:
            # Update last login
            cursor.execute(
                "UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?",
                (user['id'],)
            )
            return dict(user)
        return None


def get_admin_user(user_id: int) -> Optional[Dict]:
    """Get an admin user by ID."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, username, email, role, clinic_id, last_login, created_at
            FROM admin_users WHERE id = ?
        """, (user_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


# =============================================================================
# Consultation Config Operations (Admin-Configurable Voice Settings)
# =============================================================================

def create_consultation_config(
    config_id: str,
    name: str,
    fields: List[Dict],
    clinic_id: Optional[int] = None,
    description: Optional[str] = None,
    ai_prompt: Optional[str] = None,
    system_instruction: Optional[str] = None,
    voice_name: str = "Aoede",
    success_message: Optional[str] = None,
    emergency_message: Optional[str] = None,
    settings: Optional[Dict] = None
) -> int:
    """Create a new consultation configuration."""
    import json as json_lib
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO consultation_configs
            (config_id, clinic_id, name, description, fields, ai_prompt, system_instruction,
             voice_name, success_message, emergency_message, settings)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            config_id, clinic_id, name, description,
            json_lib.dumps(fields), ai_prompt, system_instruction,
            voice_name, success_message, emergency_message,
            json_lib.dumps(settings or {})
        ))
        return cursor.lastrowid


def get_consultation_config(config_id: str) -> Optional[Dict]:
    """Get a consultation configuration by ID."""
    import json as json_lib
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM consultation_configs WHERE config_id = ? AND is_active = 1",
            (config_id,)
        )
        row = cursor.fetchone()
        if row:
            config = dict(row)
            config['fields'] = json_lib.loads(config['fields'])
            config['settings'] = json_lib.loads(config['settings']) if config['settings'] else {}
            return config
        return None


def get_all_consultation_configs(clinic_id: Optional[int] = None) -> List[Dict]:
    """Get all consultation configurations, optionally filtered by clinic."""
    import json as json_lib
    with get_db() as conn:
        cursor = conn.cursor()
        if clinic_id:
            cursor.execute(
                "SELECT * FROM consultation_configs WHERE clinic_id = ? AND is_active = 1 ORDER BY name",
                (clinic_id,)
            )
        else:
            cursor.execute(
                "SELECT * FROM consultation_configs WHERE is_active = 1 ORDER BY name"
            )
        configs = []
        for row in cursor.fetchall():
            config = dict(row)
            config['fields'] = json_lib.loads(config['fields'])
            config['settings'] = json_lib.loads(config['settings']) if config['settings'] else {}
            configs.append(config)
        return configs


def update_consultation_config(config_id: str, **kwargs) -> bool:
    """Update a consultation configuration."""
    import json as json_lib
    if not kwargs:
        return False

    with get_db() as conn:
        cursor = conn.cursor()
        fields = []
        values = []
        valid_fields = ['name', 'description', 'fields', 'ai_prompt', 'system_instruction',
                        'voice_name', 'success_message', 'emergency_message', 'settings', 'is_active']

        for key, value in kwargs.items():
            if key in valid_fields:
                fields.append(f"{key} = ?")
                if key in ['fields', 'settings'] and isinstance(value, (dict, list)):
                    values.append(json_lib.dumps(value))
                else:
                    values.append(value)

        if not fields:
            return False

        fields.append("updated_at = CURRENT_TIMESTAMP")
        values.append(config_id)

        cursor.execute(f"""
            UPDATE consultation_configs SET {', '.join(fields)} WHERE config_id = ?
        """, values)
        return cursor.rowcount > 0


def delete_consultation_config(config_id: str) -> bool:
    """Soft delete a consultation configuration."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE consultation_configs SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE config_id = ?",
            (config_id,)
        )
        return cursor.rowcount > 0


# =============================================================================
# Vitals Operations
# =============================================================================

def add_vitals(patient_id: int, heart_rate=None, systolic_bp=None, diastolic_bp=None,
               oxygen_level=None, temperature=None, respiratory_rate=None, weight=None,
               notes=None, recorded_by=None) -> int:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO vitals (patient_id, recorded_by, heart_rate, systolic_bp, diastolic_bp,
                               oxygen_level, temperature, respiratory_rate, weight, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (patient_id, recorded_by, heart_rate, systolic_bp, diastolic_bp,
              oxygen_level, temperature, respiratory_rate, weight, notes))
        return cursor.lastrowid


def get_patient_vitals(patient_id: int, limit: int = 50) -> List[Dict]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT v.*, d.first_name || ' ' || d.last_name as recorded_by_name
            FROM vitals v
            LEFT JOIN doctors d ON v.recorded_by = d.id
            WHERE v.patient_id = ?
            ORDER BY v.recorded_at DESC LIMIT ?
        """, (patient_id, limit))
        return [dict(row) for row in cursor.fetchall()]


def get_latest_vitals(patient_id: int) -> Optional[Dict]:
    vitals = get_patient_vitals(patient_id, 1)
    return vitals[0] if vitals else None


# =============================================================================
# Doctor Notes Operations
# =============================================================================

def create_doctor_note(doctor_id: int, patient_id: int, content: str = None,
                       audio_url: str = None, note_type: str = 'text') -> int:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO doctor_notes (doctor_id, patient_id, note_type, content, audio_url)
            VALUES (?, ?, ?, ?, ?)
        """, (doctor_id, patient_id, note_type, content, audio_url))
        return cursor.lastrowid


def get_patient_doctor_notes(patient_id: int, limit: int = 50) -> List[Dict]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT dn.*, d.first_name || ' ' || d.last_name as doctor_name,
                   d.title as doctor_title, d.specialty as doctor_specialty,
                   d.photo_url as doctor_photo
            FROM doctor_notes dn
            JOIN doctors d ON dn.doctor_id = d.id
            WHERE dn.patient_id = ?
            ORDER BY dn.created_at DESC LIMIT ?
        """, (patient_id, limit))
        return [dict(row) for row in cursor.fetchall()]


def get_doctor_notes_by_doctor(doctor_id: int, limit: int = 50) -> List[Dict]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT dn.*, p.name as patient_name
            FROM doctor_notes dn
            JOIN patients p ON dn.patient_id = p.id
            WHERE dn.doctor_id = ?
            ORDER BY dn.created_at DESC LIMIT ?
        """, (doctor_id, limit))
        return [dict(row) for row in cursor.fetchall()]


def mark_notes_read(patient_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE doctor_notes SET is_read = 1 WHERE patient_id = ? AND is_read = 0",
            (patient_id,)
        )


def get_unread_notes_count(patient_id: int) -> int:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) as count FROM doctor_notes WHERE patient_id = ? AND is_read = 0",
            (patient_id,)
        )
        return cursor.fetchone()['count']


# =============================================================================
# Journal Entry Operations
# =============================================================================

def create_journal_entry(patient_id: int, entry_text: str = None, mood: str = None,
                         pain_level: int = None, symptoms: str = None) -> int:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO journal_entries (patient_id, entry_text, mood, pain_level, symptoms)
            VALUES (?, ?, ?, ?, ?)
        """, (patient_id, entry_text, mood, pain_level, symptoms))
        return cursor.lastrowid


def get_patient_journal(patient_id: int, limit: int = 50) -> List[Dict]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM journal_entries WHERE patient_id = ?
            ORDER BY created_at DESC LIMIT ?
        """, (patient_id, limit))
        return [dict(row) for row in cursor.fetchall()]


def get_today_journal(patient_id: int) -> Optional[Dict]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM journal_entries
            WHERE patient_id = ? AND DATE(created_at) = DATE('now')
            ORDER BY created_at DESC LIMIT 1
        """, (patient_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


# =============================================================================
# Billing Operations
# =============================================================================

def create_billing(patient_id: int, description: str, amount: float,
                   insurance_covered: float = 0, patient_responsibility: float = 0,
                   appointment_id: int = None, status: str = 'pending') -> int:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO billing (patient_id, appointment_id, description, amount,
                                insurance_covered, patient_responsibility, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (patient_id, appointment_id, description, amount,
              insurance_covered, patient_responsibility, status))
        return cursor.lastrowid


def get_patient_billing(patient_id: int, limit: int = 50) -> List[Dict]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT b.*, p.name as patient_name
            FROM billing b
            JOIN patients p ON b.patient_id = p.id
            WHERE b.patient_id = ?
            ORDER BY b.created_at DESC LIMIT ?
        """, (patient_id, limit))
        return [dict(row) for row in cursor.fetchall()]


def get_all_billing(status: str = None, limit: int = 100) -> List[Dict]:
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT b.*, p.name as patient_name
            FROM billing b
            JOIN patients p ON b.patient_id = p.id
        """
        params = []
        if status:
            query += " WHERE b.status = ?"
            params.append(status)
        query += " ORDER BY b.created_at DESC LIMIT ?"
        params.append(limit)
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]


def get_billing_summary() -> Dict:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT SUM(amount) as total_billed FROM billing")
        total_billed = cursor.fetchone()['total_billed'] or 0
        cursor.execute("SELECT SUM(insurance_covered) as total_insurance FROM billing")
        total_insurance = cursor.fetchone()['total_insurance'] or 0
        cursor.execute("SELECT SUM(patient_responsibility) as total_patient FROM billing WHERE status != 'paid'")
        outstanding = cursor.fetchone()['total_patient'] or 0
        cursor.execute("""
            SELECT SUM(patient_responsibility) - SUM(CASE WHEN status='paid' THEN patient_responsibility ELSE 0 END)
            as credit_balance FROM billing
        """)
        cursor.execute("SELECT COUNT(*) as count FROM billing WHERE status = 'pending'")
        pending_count = cursor.fetchone()['count']
        return {
            "total_billed": total_billed,
            "total_insurance_covered": total_insurance,
            "outstanding_balance": outstanding,
            "pending_claims": pending_count
        }


# =============================================================================
# Insurance Operations
# =============================================================================

def add_insurance(patient_id: int, provider_name: str, policy_number: str = None,
                  group_number: str = None, copay: float = None, deductible: float = None) -> int:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO insurance (patient_id, provider_name, policy_number, group_number, copay, deductible)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (patient_id, provider_name, policy_number, group_number, copay, deductible))
        return cursor.lastrowid


def get_patient_insurance(patient_id: int) -> List[Dict]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM insurance WHERE patient_id = ? ORDER BY is_primary DESC", (patient_id,))
        return [dict(row) for row in cursor.fetchall()]


# =============================================================================
# Prescription Operations
# =============================================================================

def create_prescription(patient_id: int, doctor_id: int, medication_name: str,
                        dosage: str = None, frequency: str = None, quantity: int = None,
                        refills: int = 0, instructions: str = None, pharmacy: str = None) -> int:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO prescriptions (patient_id, doctor_id, medication_name, dosage, frequency,
                                       quantity, refills, instructions, pharmacy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (patient_id, doctor_id, medication_name, dosage, frequency,
              quantity, refills, instructions, pharmacy))
        return cursor.lastrowid


def get_patient_prescriptions(patient_id: int, active_only: bool = True) -> List[Dict]:
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT p.*, d.first_name || ' ' || d.last_name as doctor_name
            FROM prescriptions p
            JOIN doctors d ON p.doctor_id = d.id
            WHERE p.patient_id = ?
        """
        if active_only:
            query += " AND p.status = 'active'"
        query += " ORDER BY p.prescribed_date DESC"
        cursor.execute(query, (patient_id,))
        return [dict(row) for row in cursor.fetchall()]


# =============================================================================
# Lab Results Operations
# =============================================================================

def create_lab_result(patient_id: int, lab_type: str, test_name: str,
                      ordered_by: int = None, result_value: str = None,
                      unit: str = None, reference_range: str = None,
                      is_abnormal: bool = False, notes: str = None) -> int:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO lab_results (patient_id, ordered_by, lab_type, test_name,
                                     result_value, unit, reference_range, is_abnormal, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (patient_id, ordered_by, lab_type, test_name,
              result_value, unit, reference_range, 1 if is_abnormal else 0, notes))
        return cursor.lastrowid


def get_patient_labs(patient_id: int, lab_type: str = None, limit: int = 50) -> List[Dict]:
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT lr.*, d.first_name || ' ' || d.last_name as ordered_by_name
            FROM lab_results lr
            LEFT JOIN doctors d ON lr.ordered_by = d.id
            WHERE lr.patient_id = ?
        """
        params = [patient_id]
        if lab_type:
            query += " AND lr.lab_type = ?"
            params.append(lab_type)
        query += " ORDER BY lr.ordered_date DESC LIMIT ?"
        params.append(limit)
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]


# =============================================================================
# Appointment Operations (extended)
# =============================================================================

def get_appointments_by_doctor(doctor_id: int, status: str = None, limit: int = 50) -> List[Dict]:
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT a.*, p.name as patient_name, cs.service_name,
                   c.name as clinic_name
            FROM appointments a
            LEFT JOIN patients p ON a.patient_id = p.id
            LEFT JOIN clinic_services cs ON a.service_id = cs.id
            LEFT JOIN clinics c ON a.clinic_id = c.id
            WHERE a.doctor_id = ?
        """
        params = [doctor_id]
        if status:
            query += " AND a.status = ?"
            params.append(status)
        query += " ORDER BY a.appointment_date ASC, a.appointment_time ASC LIMIT ?"
        params.append(limit)
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]


def get_today_appointments(doctor_id: int = None) -> List[Dict]:
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT a.*, p.name as patient_name, cs.service_name,
                   d.first_name || ' ' || d.last_name as doctor_name
            FROM appointments a
            LEFT JOIN patients p ON a.patient_id = p.id
            LEFT JOIN clinic_services cs ON a.service_id = cs.id
            LEFT JOIN doctors d ON a.doctor_id = d.id
            WHERE DATE(a.appointment_date) = DATE('now')
        """
        params = []
        if doctor_id:
            query += " AND a.doctor_id = ?"
            params.append(doctor_id)
        query += " ORDER BY a.appointment_time ASC"
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]


def get_appointment_stats(doctor_id: int = None, days: int = 30) -> Dict:
    with get_db() as conn:
        cursor = conn.cursor()
        base = "WHERE DATE(a.appointment_date) >= DATE('now', ?)"
        params = [f'-{days} days']
        if doctor_id:
            base += " AND a.doctor_id = ?"
            params.append(doctor_id)

        cursor.execute(f"SELECT COUNT(*) as total FROM appointments a {base}", params)
        total = cursor.fetchone()['total']

        cursor.execute(f"SELECT COUNT(*) as kept FROM appointments a {base} AND a.status = 'completed'", params)
        kept = cursor.fetchone()['kept']

        cursor.execute(f"SELECT COUNT(*) as missed FROM appointments a {base} AND a.status = 'no_show'", params)
        missed = cursor.fetchone()['missed']

        cursor.execute(f"SELECT COUNT(*) as scheduled FROM appointments a {base} AND a.status = 'scheduled'", params)
        scheduled = cursor.fetchone()['scheduled']

        return {
            "total": total,
            "kept": kept,
            "missed": missed,
            "scheduled": scheduled,
            "no_show_rate": round((missed / total * 100), 1) if total > 0 else 0
        }


def create_appointment(patient_id: int, doctor_id: int, clinic_id: int,
                       appointment_date: str, appointment_time: str,
                       service_id: int = None, duration_minutes: int = 30,
                       notes: str = None, reason: str = None) -> int:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO appointments (patient_id, doctor_id, clinic_id, service_id,
                                     appointment_date, appointment_time, duration_minutes, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (patient_id, doctor_id, clinic_id, service_id,
              appointment_date, appointment_time, duration_minutes,
              notes or reason))
        return cursor.lastrowid


def update_appointment_status(appointment_id: int, status: str) -> bool:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE appointments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (status, appointment_id)
        )
        return cursor.rowcount > 0


def get_patient_appointments(patient_id: int, limit: int = 20) -> List[Dict]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT a.*, d.first_name || ' ' || d.last_name as doctor_name,
                   d.specialty as doctor_specialty, cs.service_name, c.name as clinic_name
            FROM appointments a
            LEFT JOIN doctors d ON a.doctor_id = d.id
            LEFT JOIN clinic_services cs ON a.service_id = cs.id
            LEFT JOIN clinics c ON a.clinic_id = c.id
            WHERE a.patient_id = ?
            ORDER BY a.appointment_date DESC, a.appointment_time DESC LIMIT ?
        """, (patient_id, limit))
        return [dict(row) for row in cursor.fetchall()]


# =============================================================================
# Doctor Feed Helpers (Stories + Feed for Instagram-style Doctor Portal)
# =============================================================================

def get_doctor_patient_stories(doctor_id: int) -> List[Dict]:
    """Get patients with today's updates for the stories bar."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT DISTINCT p.id as patient_id, p.name as patient_name,
                   (SELECT COUNT(*) FROM journal_entries je
                    WHERE je.patient_id = p.id AND DATE(je.created_at) = DATE('now')) as today_entries,
                   (SELECT je.entry_text FROM journal_entries je
                    WHERE je.patient_id = p.id AND DATE(je.created_at) = DATE('now')
                    ORDER BY je.created_at DESC LIMIT 1) as latest_entry,
                   (SELECT je.mood FROM journal_entries je
                    WHERE je.patient_id = p.id AND DATE(je.created_at) = DATE('now')
                    ORDER BY je.created_at DESC LIMIT 1) as latest_mood,
                   (SELECT COUNT(*) FROM doctor_notes dn
                    WHERE dn.patient_id = p.id AND dn.doctor_id = ? AND DATE(dn.created_at) = DATE('now')) as viewed
            FROM patients p
            JOIN appointments a ON a.patient_id = p.id AND a.doctor_id = ?
            WHERE EXISTS (
                SELECT 1 FROM journal_entries je
                WHERE je.patient_id = p.id AND DATE(je.created_at) = DATE('now')
            )
            ORDER BY p.name ASC
        """, (doctor_id, doctor_id))
        return [dict(row) for row in cursor.fetchall()]


def get_doctor_feed_summaries(doctor_id: int, limit: int = 50) -> List[Dict]:
    """Get patient summaries for the doctor's feed, alphabetical by patient name."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.*, p.name as patient_name, p.id as patient_id,
                   p.date_of_birth
            FROM summaries s
            JOIN patients p ON s.patient_id = p.id
            JOIN appointments a ON a.patient_id = p.id AND a.doctor_id = ?
            ORDER BY p.name ASC, s.created_at DESC
        """, (doctor_id,))
        return [dict(row) for row in cursor.fetchall()]


def get_all_patients_for_doctor(doctor_id: int) -> List[Dict]:
    """Get all patients for a specific doctor."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT DISTINCT p.*,
                   (SELECT MAX(a2.appointment_date) FROM appointments a2
                    WHERE a2.patient_id = p.id AND a2.doctor_id = ?) as last_visit,
                   (SELECT COUNT(*) FROM summaries s WHERE s.patient_id = p.id) as summary_count,
                   (SELECT COUNT(*) FROM prescriptions pr WHERE pr.patient_id = p.id AND pr.status = 'active') as active_prescriptions
            FROM patients p
            JOIN appointments a ON a.patient_id = p.id AND a.doctor_id = ?
            ORDER BY p.name ASC
        """, (doctor_id, doctor_id))
        return [dict(row) for row in cursor.fetchall()]


# =============================================================================
# ClinicAdmin Dashboard Helpers
# =============================================================================

def get_clinic_admin_stats(clinic_id: int = None) -> Dict:
    with get_db() as conn:
        cursor = conn.cursor()

        # Today's intakes
        cursor.execute("""
            SELECT COUNT(*) as count FROM appointments
            WHERE DATE(appointment_date) = DATE('now') AND status IN ('scheduled', 'completed')
        """)
        today_sessions = cursor.fetchone()['count']

        # Total patients
        cursor.execute("SELECT COUNT(*) as count FROM patients")
        total_patients = cursor.fetchone()['count']

        # Appointment stats
        apt_stats = get_appointment_stats()

        # Billing summary
        bill_summary = get_billing_summary()

        return {
            "today_sessions": today_sessions,
            "total_patients": total_patients,
            "appointment_stats": apt_stats,
            "billing_summary": bill_summary
        }


# Initialize database on module import
init_database()

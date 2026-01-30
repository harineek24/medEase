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


# Initialize database on module import
init_database()

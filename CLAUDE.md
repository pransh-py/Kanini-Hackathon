# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Healthcare Triage Management System with a React frontend and Django REST API backend. Nurses create triage/emergency requests for patients; doctors review assigned cases and can resolve, convert, or update patient history. ML models predict risk levels and recommend departments. Multi-modal input supported: text, voice (Whisper), and PDF extraction.

## Architecture

**Two independent apps in one repo:**
- `frontend/` — React 19 SPA (Create React App, port 3000)
- `Triage/` — Django 6 project with a single app (`login/`), port 8000

**Data flow:** React frontend → fetch with credentials → Django REST Framework API → SQLite

**Auth:** Django session-based authentication. User roles determined by Django groups (`Nurses`, `Doctors`). Views use `AllowAny` permission class but manually check group membership. A custom `CsrfExemptSessionAuthentication` class is used on mutation endpoints.

**Models (Triage/login/models.py):**
- `StaffProfile` — extends Django User (employee_id auto-generated, department, language)
- `Patient` — demographics + 10 boolean medical history fields + allergies/past_surgeries
- `TriageRequest` — OneToOne(Patient), links Nurse/Doctor, 4 vitals, 29 symptom booleans, predicted_risk, recommended_department
- `EmergencyRequest` — OneToOne(Patient), links Nurse/Doctor, department. Patient cannot be in both TriageRequest and EmergencyRequest simultaneously.

**ML Pipeline (Triage/login/D/):**
- `triage_model.pkl` + `model_features.pkl` — Random Forest risk prediction (High/Moderate/Low)
- `department_model.pkl` + `department_model_features.pkl` — Department classification
- Risk prediction called via `predict_risk()`, department via `predict_department()` in views.py (~lines 731-783)
- Whisper model loaded at module level for audio transcription
- SentenceTransformer used for embedding-based department similarity matching with critical keyword override

## Commands

### Frontend (from `frontend/`)
```bash
npm start          # Dev server on :3000
npm run build      # Production build
npm test           # Jest test runner
```

### Backend (from `Triage/`)
```bash
python manage.py runserver              # Dev server on :8000
python manage.py makemigrations login   # After model changes
python manage.py migrate                # Apply migrations
python manage.py createsuperuser        # Create admin user
```

No `requirements.txt` exists. Backend dependencies: `django`, `djangorestframework`, `django-cors-headers`, `python-dotenv`, `anthropic`, `whisper`, `sentence-transformers`, `scikit-learn`, `PyPDF2`.

## API Endpoints

All defined in `Triage/login/urls.py` (16 endpoints):

**Auth:**
- `POST /api/login/` — session login
- `POST /api/logout/` — logout
- `GET /api/user-role/` — returns `{role, name}`

**Dashboards:**
- `GET /api/nurse-dashboard/` — triage requests for logged-in nurse
- `GET /api/doctor-dashboard/` — returns `{triage_requests, emergency_requests}` with full patient data

**Patient:**
- `GET /api/patient/search/?q=` — search patients by name
- `POST /api/patient/create/` — register new patient
- `PATCH /api/patient/<id>/history/` — update patient medical history booleans + allergies/surgeries

**Triage:**
- `POST /api/triage-request/create/` — create triage with vitals+symptoms, auto-assigns doctor
- `DELETE /api/triage-request/<id>/resolve/` — doctor resolves/discharges triage

**Emergency:**
- `GET /api/doctors/?department=` — list doctors by department with patient counts
- `POST /api/emergency/confirm/` — nurse creates emergency case with doctor assignment
- `POST /api/emergency/<id>/convert/` — doctor converts emergency to triage (runs ML prediction)

**AI/ML:**
- `POST /api/triage/` — text symptom analysis via embeddings, returns department + confidence
- `POST /api/whisper/` — audio transcription + translation
- `POST /api/inpatient-analyze/` — PDF extraction with symptom matching

## Frontend Structure

`frontend/src/App.js` defines five routes:
- `/` → `Login.js` — role-based redirect after auth
- `/nurse` → `NurseDashboard.js` — triage request cards with vitals/risk
- `/nurse/emergency` → `EmergencyCases.js` — emergency case creation with voice/manual input
- `/nurse/inpatients` → `Inpatients.js` — PDF upload, patient registration, triage form with voice auto-fill
- `/doctor` → `DoctorDashboard.js` — list/detail view with human body SVG, resolve/convert/edit actions

All API calls use `fetch` with `credentials: 'include'` for session cookies. CSRF tokens read from cookies via `getCookie("csrftoken")`. API base URL is hardcoded as `http://localhost:8000` in each page.

## Key Configuration

- **API base URL** hardcoded in frontend pages — update when changing environments
- **CORS:** `CORS_ALLOW_ALL_ORIGINS = True` in `Triage/Triage/settings.py`
- **Anthropic API key** loaded from root `.env` file via `python-dotenv`
- **Database:** SQLite at `Triage/db.sqlite3`
- **CSRF trusted origins:** configured for `localhost:3000` and `192.168.18.198:3000`
- **Department choices** (shared across models): Emergency, General_Medicine, Cardiology, Neurology, Pulmonology, Gastroenterology, Orthopedics, Pediatrics, Nephrology, Endocrinology

## Patterns to Follow

- Error handling uses inline error banners (`errorMsg` state + styled div), not `alert()`. DoctorDashboard uses `actionError`, Inpatients/EmergencyCases use `errorMsg`.
- Backend views wrap `objects.create()` in `try/except IntegrityError` for OneToOne constraint violations, returning 409 with `{error: "..."}`.
- Doctor endpoints verify ownership: `TriageRequest.objects.get(id=..., assigned_doctor=request.user)`.
- Auto-assignment logic: after creating a TriageRequest, least-loaded doctor in the predicted department is auto-assigned via annotated query.

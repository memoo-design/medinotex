# MediNotex – Flask + Azure Backend

Full backend for the **MediNotex Doctor Dashboard** frontend.

---

## Architecture

```
Frontend (doctor_dashboard.html)
        │
        ▼
Flask Backend (API Layer)  ← Flask-Login sessions
        │
   ┌────┴─────────────────────────────────┐
   │         Database (SQLite / PG)        │
   │  Users · Patients · ClinicalNotes    │
   │  AISummaries · Appointments          │
   │  Notifications                        │
   └───────────────────────────────────────┘
        │
   ┌────┴──────────────────────────────────────────────┐
   │             Azure Services Layer                   │
   │  Blob Storage  │  AI Language  │  Doc Intelligence │
   └────────────────────────────────────────────────────┘
```

---

## Endpoints

| Feature            | Endpoint                          | Azure Role                  |
|--------------------|-----------------------------------|-----------------------------|
| Register           | `POST /auth/register`             | None                        |
| Login              | `POST /auth/login`                | None                        |
| Logout             | `POST /auth/logout`               | None                        |
| Current user       | `GET  /auth/me`                   | None                        |
| List patients      | `GET  /api/patients/`             | None                        |
| Add patient        | `POST /api/patients/`             | None                        |
| Get patient        | `GET  /api/patients/<id>`         | None                        |
| Update patient     | `PUT  /api/patients/<id>`         | None                        |
| Delete patient     | `DELETE /api/patients/<id>`       | None                        |
| Upload file        | `POST /api/upload/file`           | Blob Storage + Doc Intel    |
| Submit text note   | `POST /api/upload/text`           | None                        |
| Get note           | `GET  /api/upload/<id>`           | Blob SAS URL                |
| Delete note        | `DELETE /api/upload/<id>`         | Blob Storage                |
| Generate SOAP      | `POST /api/summaries/generate`    | **AI Language Service**     |
| List summaries     | `GET  /api/summaries/`            | None                        |
| Get summary        | `GET  /api/summaries/<id>`        | None                        |
| Patient summaries  | `GET  /api/summaries/patient/<id>`| None                        |
| Delete summary     | `DELETE /api/summaries/<id>`      | None                        |
| List appointments  | `GET  /api/appointments/`         | None                        |
| Upcoming appts     | `GET  /api/appointments/upcoming` | None                        |
| Create appointment | `POST /api/appointments/`         | None                        |
| Update appointment | `PUT  /api/appointments/<id>`     | None                        |
| Delete appointment | `DELETE /api/appointments/<id>`   | None                        |
| List notifications | `GET  /api/notifications/`        | None                        |
| Mark read          | `POST /api/notifications/<id>/read`| None                       |
| Mark all read      | `POST /api/notifications/read-all`| None                        |
| Delete notif       | `DELETE /api/notifications/<id>`  | None                        |
| Dashboard stats    | `GET  /api/dashboard/stats`       | None                        |
| Get profile        | `GET  /api/profile/`              | None                        |
| Update profile     | `PUT  /api/profile/`              | None                        |
| Change password    | `POST /api/profile/password`      | None                        |

---

## Quick Start

### 1. Clone & create virtual environment

```bash
cd medinotex
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in your values (see Azure setup below)
```

### 4. Initialize & seed the database

```bash
flask --app app db init          # First time only
flask --app app db migrate -m "init"
flask --app app db upgrade
python seed.py                   # Loads sample patients + doctor account
```

### 5. Run the server

```bash
python app.py
# Server starts at http://localhost:5000
```

### 6. Open the frontend

Open `doctor_dashboard.html` in a browser.  
Update the API base URL in the HTML JS (currently uses mock data) to point to `http://localhost:5000`.

---

## Azure Setup (Step-by-Step)

### Azure Blob Storage
1. Go to [portal.azure.com](https://portal.azure.com)
2. Create a **Storage Account** (any name, LRS redundancy is fine)
3. Go to **Access Keys** → copy **Connection string**
4. Paste into `AZURE_STORAGE_CONNECTION_STRING` in `.env`
5. The container (`clinical-notes`) is auto-created on first upload

### Azure AI Language Service
1. Create a **Language** resource (free F0 tier: 5,000 calls/month)
2. Go to **Keys and Endpoint** → copy **Key 1** and **Endpoint**
3. Paste into `AZURE_LANGUAGE_KEY` and `AZURE_LANGUAGE_ENDPOINT` in `.env`

### Azure Document Intelligence (Optional)
1. Create a **Document Intelligence** resource (free F0: 500 pages/month)
2. Go to **Keys and Endpoint** → copy values
3. Paste into `AZURE_FORM_RECOGNIZER_KEY` / `AZURE_FORM_RECOGNIZER_ENDPOINT`

> **No Azure keys?** The backend degrades gracefully:
> - File uploads save locally (skip Blob Storage)
> - SOAP generation uses heuristic parsing (skip AI Language)
> - OCR uses PyPDF2/python-docx locally (skip Document Intelligence)

---

## Project Structure

```
medinotex/
├── app.py                    ← Flask app factory + entry point
├── config.py                 ← All configuration (reads .env)
├── extensions.py             ← db, migrate, bcrypt (avoids circular imports)
├── seed.py                   ← Sample data loader
├── requirements.txt
├── .env.example              ← Copy to .env and fill in secrets
│
├── models/
│   ├── user.py               ← Doctor account
│   ├── patient.py            ← Patient record
│   └── clinical.py           ← ClinicalNote, AISummary, Appointment, Notification
│
├── routes/
│   ├── auth.py               ← /auth/*
│   ├── patients.py           ← /api/patients/*
│   ├── upload.py             ← /api/upload/*
│   ├── summaries.py          ← /api/summaries/*
│   ├── appointments.py       ← /api/appointments/*
│   ├── notifications.py      ← /api/notifications/*
│   ├── dashboard.py          ← /api/dashboard/*
│   └── profile.py            ← /api/profile/*
│
└── services/
    ├── blob_storage.py        ← Azure Blob Storage (upload, SAS URL, delete)
    ├── ai_language.py         ← Azure AI Language (key phrases, NER, SOAP builder)
    └── document_intelligence.py ← Azure Document Intelligence (OCR)
```

---

## Typical API Flow (matching the frontend)

```
1. POST /auth/login                      → doctor logs in
2. GET  /api/dashboard/stats             → Dashboard page loads
3. GET  /api/patients/?page=1            → Patients page loads
4. POST /api/upload/file  (multipart)    → Upload Clinical Note page
         └─ Azure Blob Storage saves file
         └─ Azure Document Intelligence extracts text
5. POST /api/summaries/generate {note_id}→ Generate AI Summary button
         └─ Azure AI Language returns key phrases + entities
         └─ SOAP note built and saved to DB
6. GET  /api/summaries/                  → AI Summaries page loads
7. GET  /api/appointments/upcoming       → Dashboard appointment widget
```

---

## Security Notes

- All routes (except `/auth/register` and `/auth/login`) require `@login_required`
- Passwords are bcrypt-hashed
- SAS URLs expire in 1 hour (configurable in `blob_storage.py`)
- File types restricted to PDF, DOCX, TXT
- Max upload size: 16 MB
- CORS restricted to `CORS_ORIGINS` in `.env`

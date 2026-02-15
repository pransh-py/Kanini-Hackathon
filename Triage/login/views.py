from django.contrib.auth import authenticate, login, logout
from django.views.decorators.csrf import csrf_exempt
from django.db import IntegrityError
from rest_framework.decorators import (
    api_view,
    permission_classes,
    parser_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework import status

from django.contrib.auth.models import User
from django.db.models import Count
from .models import TriageRequest, StaffProfile, Patient, EmergencyRequest
from rest_framework.decorators import (
    api_view,
    permission_classes,
    parser_classes,
    authentication_classes,   # ← ADD THIS
)

from sentence_transformers import SentenceTransformer, util
import torch
import whisper
import tempfile
import os
from rest_framework.authentication import SessionAuthentication
from .D.department_model import predict_department
from .D.risk_model_v2 import predict_risk


class CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return  # 🚀 disables CSRF check


# -------------------------------
# 🔥 Load Models ONCE (Important)
# -------------------------------

embedding_model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
whisper_model = whisper.load_model("medium")


# -------------------------------
# 🏥 Department Descriptions
# -------------------------------

DEPARTMENTS = {

    "Emergency": """
    Severe trauma, uncontrolled bleeding, stab wounds, gunshot injuries,
    cardiac arrest, stroke symptoms, seizures,
    severe breathlessness, shock,
    multi-system instability, undifferentiated critical patient
    """,

    "General_Medicine": """
    High fever, sepsis, infection,
    dehydration, diabetic emergency,
    hypertension crisis, general weakness,
    multi-organ medical conditions
    """,

    "Cardiology": """
    Chest pain, myocardial infarction,
    cardiac arrest, palpitations,
    heart failure, arrhythmia,
    sudden collapse
    """,

    "Neurology": """
    Stroke symptoms, seizures,
    paralysis, loss of consciousness,
    head injury, severe sudden headache
    """,

    "Pulmonology": """
    Severe breathlessness, asthma attack,
    COPD exacerbation, pneumothorax,
    respiratory distress, oxygen saturation dropping
    """,

    "Gastroenterology": """
    GI bleeding, vomiting blood,
    black stools, pancreatitis,
    liver failure, severe abdominal pain
    """,

    "Orthopedics": """
    Fractures, broken bones,
    dislocations, crush injuries,
    pelvic fracture, inability to move limb
    """,

    "Pediatrics": """
    Infant breathing difficulty,
    febrile seizures in child,
    severe dehydration in child,
    pediatric emergency cases
    """,

    "Nephrology": """
    Kidney failure, dialysis emergency,
    severe electrolyte imbalance,
    fluid overload, renal crisis
    """,

    "Endocrinology": """
    Diabetic ketoacidosis,
    thyroid storm, adrenal crisis,
    severe blood sugar imbalance
    """
}



department_names = list(DEPARTMENTS.keys())
department_embeddings = embedding_model.encode(
    list(DEPARTMENTS.values()),
    convert_to_tensor=True
)


# -------------------------------
# 🎤 Whisper Transcription API
# -------------------------------

@api_view(["POST"])
@authentication_classes([CsrfExemptSessionAuthentication])
@parser_classes([MultiPartParser, FormParser])
def whisper_transcribe(request):
    audio_file = request.FILES.get("audio")

    if not audio_file:
        return Response({"error": "No audio file provided"}, status=400)

    # Get language from nurse's profile
    language = "auto"
    if request.user.is_authenticated:
        try:
            language = request.user.staffprofile.language or "auto"
        except StaffProfile.DoesNotExist:
            pass

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
        for chunk in audio_file.chunks():
            temp_audio.write(chunk)
        temp_path = temp_audio.name

    try:
        transcribe_kwargs = {
            "task": "translate",  # 🔥 Always translate to English
        }
        if language and language != "auto":
            transcribe_kwargs["language"] = language

        result = whisper_model.transcribe(temp_path, **transcribe_kwargs)

        translated_text = result.get("text", "").strip()
        detected_language = result.get("language", "unknown")

    except Exception as e:
        os.remove(temp_path)
        return Response({"error": f"Whisper failed: {str(e)}"}, status=500)

    os.remove(temp_path)

    if not translated_text:
        return Response({"error": "No speech detected. Try recording again."}, status=400)

    return Response({
        "translated_text": translated_text,
        "detected_language": detected_language
    })


# -------------------------------
# 🏥 Triage Classification API
# -------------------------------

@api_view(["POST"])
def triage_api(request):
    symptoms = request.data.get("symptoms", "").strip()

    if not symptoms:
        return Response(
            {"error": "Symptoms field is required"},
            status=status.HTTP_400_BAD_REQUEST
        )

    lower_text = symptoms.lower()

    # 🚨 Critical Override Safety Layer
    CRITICAL_WORDS = [
        "unconscious",
        "not breathing",
        "cardiac arrest",
        "massive bleeding"
    ]

    for word in CRITICAL_WORDS:
        if word in lower_text:
            return Response({
                "input_text": symptoms,
                "assigned_department": "Emergency",
                "confidence": 1.0,
                "triage_level": "RED - CRITICAL"
            })

    # 🔹 Embedding classification
    patient_embedding = embedding_model.encode(
        symptoms,
        convert_to_tensor=True
    )

    similarities = util.cos_sim(
        patient_embedding,
        department_embeddings
    )

    best_match_index = torch.argmax(similarities).item()
    assigned_department = department_names[best_match_index]
    confidence_score = float(similarities[0][best_match_index])

    if confidence_score < 0.45:
        assigned_department = "General_Medicine"


    return Response({
        "input_text": symptoms,
        "assigned_department": assigned_department,
        "confidence": round(confidence_score, 3)
    })


@api_view(["POST"])
@authentication_classes([CsrfExemptSessionAuthentication])
@parser_classes([MultiPartParser, FormParser])
def inpatient_analyze(request):
    import pdfplumber
    import re

    pdf_file = request.FILES.get("file")
    if not pdf_file:
        return Response({"error": "No PDF file provided"}, status=400)

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            for chunk in pdf_file.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name

        extracted_text = ""
        with pdfplumber.open(tmp_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    extracted_text += page_text + "\n"

        os.remove(tmp_path)

        extracted_text = extracted_text.strip()
        if not extracted_text:
            return Response({"error": "No text found in PDF"}, status=400)

        # --- Extract patient name ---
        patient_name = ""
        name_patterns = [
            r"(?:patient|patient\s*name|name\s*of\s*patient|name)\s*[:\-]\s*(.+)",
            r"(?:mr|mrs|ms|dr)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)",
            r"^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)",  # First line capitalized words
        ]
        for pattern in name_patterns:
            match = re.search(pattern, extracted_text, re.IGNORECASE | re.MULTILINE)
            if match:
                candidate = match.group(1).strip().split("\n")[0].strip()
                # Clean trailing noise (numbers, dates, colons)
                candidate = re.sub(r"[,;:\d/\-]+$", "", candidate).strip()
                if 2 <= len(candidate.split()) <= 5 and len(candidate) <= 60:
                    patient_name = candidate
                    break

        # --- Extract matched symptoms ---
        lower = extracted_text.lower()
        symptom_map = {
            "chest_pain": ["chest pain", "chest hurts", "pain in chest"],
            "severe_breathlessness": ["severe breathlessness", "cannot breathe", "extreme difficulty breathing"],
            "sudden_confusion": ["sudden confusion", "confused", "disoriented", "confusion"],
            "stroke_symptoms": ["stroke", "facial droop", "slurred speech"],
            "seizure": ["seizure", "convulsion", "fits"],
            "severe_trauma": ["severe trauma", "major injury", "major trauma"],
            "uncontrolled_bleeding": ["uncontrolled bleeding", "heavy bleeding", "massive bleeding"],
            "loss_of_consciousness": ["unconscious", "loss of consciousness", "passed out", "unresponsive"],
            "severe_allergic_reaction": ["anaphylaxis", "severe allergic", "allergic reaction"],
            "persistent_fever": ["persistent fever", "high fever", "fever"],
            "vomiting": ["vomiting", "throwing up", "nausea and vomiting"],
            "moderate_abdominal_pain": ["abdominal pain", "stomach pain", "belly pain"],
            "persistent_cough": ["persistent cough", "chronic cough"],
            "moderate_breathlessness": ["breathlessness", "shortness of breath", "difficulty breathing"],
            "severe_headache": ["severe headache", "intense headache", "worst headache"],
            "dizziness": ["dizziness", "dizzy", "lightheaded", "vertigo"],
            "dehydration": ["dehydration", "dehydrated"],
            "palpitations": ["palpitations", "heart racing", "rapid heartbeat"],
            "migraine": ["migraine"],
            "mild_headache": ["mild headache", "headache", "head hurts"],
            "sore_throat": ["sore throat", "throat pain"],
            "runny_nose": ["runny nose", "nasal congestion", "stuffy nose"],
            "mild_cough": ["mild cough", "cough", "slight cough"],
            "fatigue": ["fatigue", "tired", "exhausted", "weakness", "lethargic"],
            "body_ache": ["body ache", "body pain", "muscle pain"],
            "mild_abdominal_pain": ["mild abdominal pain", "mild stomach pain"],
            "skin_rash": ["skin rash", "rash", "itchy skin", "hives"],
            "mild_back_pain": ["mild back pain", "back pain", "backache"],
            "mild_joint_pain": ["mild joint pain", "joint pain", "knee pain"],
        }

        matched_symptoms = {}
        for key, keywords in symptom_map.items():
            for kw in keywords:
                if kw in lower:
                    matched_symptoms[key] = True
                    break

        return Response({
            "patient_name": patient_name,
            "matched_symptoms": matched_symptoms,
            "raw_text": extracted_text,
        })

    except Exception as e:
        return Response({"error": f"Failed to process PDF: {str(e)}"}, status=500)


# -------------------------------
# 🔐 Authentication APIs
# -------------------------------

@api_view(['POST'])
@permission_classes([AllowAny])
@csrf_exempt
def login_api(request):
    employee_id = request.data.get('employee_id', '').strip()
    password = request.data.get('password')

    if not employee_id:
        return Response({"error": "Employee ID is required"}, status=400)

    # Look up user by employee_id
    try:
        profile = StaffProfile.objects.get(employee_id=employee_id)
        user = authenticate(username=profile.user.username, password=password)
    except StaffProfile.DoesNotExist:
        user = None

    if user is not None:
        login(request, user)
        return Response({"message": "Login successful"})
    else:
        return Response({"error": "Invalid Employee ID or password"}, status=400)


@api_view(['POST'])
@permission_classes([AllowAny])
@csrf_exempt
def logout_api(request):
    logout(request)
    return Response({"message": "Logged out"})


# -------------------------------
# 👩‍⚕️ Nurse Dashboard
# -------------------------------

@api_view(['GET'])
@permission_classes([AllowAny])
def nurse_dashboard_api(request):

    if not request.user.groups.filter(name='Nurses').exists():
        return Response({"error": "Unauthorized"}, status=403)

    triage_requests = TriageRequest.objects.filter(
        nurse=request.user
    ).select_related('patient').order_by('-created_at')

    data = []

    for t in triage_requests:
        entry = {}
        for field in t._meta.fields:
            if field.name in ('patient', 'nurse', 'assigned_doctor'):
                continue
            entry[field.name] = getattr(t, field.name)
        entry['type'] = 'triage'
        entry['patient_name'] = t.patient.full_name
        entry['patient_age'] = t.patient.age
        entry['patient_gender'] = t.patient.gender
        entry['nurse_id'] = t.nurse_id
        entry['assigned_doctor_id'] = t.assigned_doctor_id

        data.append(entry)

    emergency_requests = EmergencyRequest.objects.filter(
        nurse=request.user
    ).select_related('patient').order_by('-created_at')

    for e in emergency_requests:
        entry = {}

        for field in e._meta.fields:
            if field.name in ('patient', 'nurse', 'doctor'):
                continue
            entry[field.name] = getattr(e, field.name)

        entry['type'] = 'emergency'
        entry['patient_name'] = e.patient.full_name
        entry['patient_age'] = e.patient.age
        entry['patient_gender'] = e.patient.gender
        entry['nurse_id'] = e.nurse_id
        entry['assigned_doctor_id'] = e.doctor_id

        data.append(entry)

        
    return Response(data)


# -------------------------------
# 👨‍⚕️ Doctor Dashboard
# -------------------------------

@api_view(['GET'])
@permission_classes([AllowAny])
def doctor_dashboard_api(request):

    if not request.user.groups.filter(name='Doctors').exists():
        return Response({"error": "Unauthorized"}, status=403)

    # Triage requests with full patient data
    triage_requests = TriageRequest.objects.filter(
        assigned_doctor=request.user
    ).select_related('patient').order_by('-created_at')

    triage_data = []
    for t in triage_requests:
        entry = {}
        for field in t._meta.fields:
            if field.name in ('patient', 'nurse', 'assigned_doctor'):
                continue
            entry[field.name] = getattr(t, field.name)

        entry['patient_id'] = t.patient.id
        entry['patient_name'] = t.patient.full_name
        entry['patient_age'] = t.patient.age
        entry['patient_gender'] = t.patient.gender
        entry['patient_blood_group'] = t.patient.blood_group
        entry['patient_allergies'] = t.patient.allergies
        entry['patient_past_surgeries'] = t.patient.past_surgeries
        entry['patient_diabetes'] = t.patient.diabetes
        entry['patient_hypertension'] = t.patient.hypertension
        entry['patient_heart_disease'] = t.patient.heart_disease
        entry['patient_asthma'] = t.patient.asthma
        entry['patient_chronic_kidney_disease'] = t.patient.chronic_kidney_disease
        entry['patient_previous_stroke'] = t.patient.previous_stroke
        entry['patient_smoker'] = t.patient.smoker
        entry['patient_obese'] = t.patient.obese
        entry['patient_previous_heart_attack'] = t.patient.previous_heart_attack
        entry['patient_previous_hospitalization'] = t.patient.previous_hospitalization
        entry['nurse_id'] = t.nurse_id
        entry['assigned_doctor_id'] = t.assigned_doctor_id

        triage_data.append(entry)

    # Emergency requests
    emergency_requests = EmergencyRequest.objects.filter(
        doctor=request.user
    ).select_related('patient').order_by('-created_at')

    emergency_data = []
    for e in emergency_requests:
        emergency_data.append({
            'id': e.id,
            'patient_id': e.patient.id,
            'patient_name': e.patient.full_name,
            'patient_age': e.patient.age,
            'patient_gender': e.patient.gender,
            'patient_blood_group': e.patient.blood_group,
            'patient_allergies': e.patient.allergies,
            'patient_past_surgeries': e.patient.past_surgeries,
            'patient_diabetes': e.patient.diabetes,
            'patient_hypertension': e.patient.hypertension,
            'patient_heart_disease': e.patient.heart_disease,
            'patient_asthma': e.patient.asthma,
            'patient_chronic_kidney_disease': e.patient.chronic_kidney_disease,
            'patient_previous_stroke': e.patient.previous_stroke,
            'patient_smoker': e.patient.smoker,
            'patient_obese': e.patient.obese,
            'patient_previous_heart_attack': e.patient.previous_heart_attack,
            'patient_previous_hospitalization': e.patient.previous_hospitalization,
            'department': e.department,
            'nurse_id': e.nurse_id,
            'created_at': e.created_at,
        })

    return Response({
        'triage_requests': triage_data,
        'emergency_requests': emergency_data,
    })


# -------------------------------
# 👤 User Role API
# -------------------------------

@api_view(['GET'])
@permission_classes([AllowAny])
def user_role(request):

    name = request.user.get_full_name() or request.user.username

    if request.user.groups.filter(name='Nurses').exists():
        return Response({"role": "nurse", "name": name})

    if request.user.groups.filter(name='Doctors').exists():
        return Response({"role": "doctor", "name": name})

    return Response({"role": "none"})


# -------------------------------
# 🔍 Patient Search API
# -------------------------------

@api_view(['GET'])
@permission_classes([AllowAny])
def patient_search(request):
    query = request.GET.get("q", "").strip()

    if not query:
        return Response([])

    patients = Patient.objects.filter(full_name__icontains=query)[:10]

    results = []
    for p in patients:
        results.append({
            "id": p.id,
            "full_name": p.full_name,
            "age": p.age,
            "gender": p.gender,
            "blood_group": p.blood_group,
            "allergies": p.allergies,
            "past_surgeries": p.past_surgeries,
            "diabetes": p.diabetes,
            "hypertension": p.hypertension,
            "heart_disease": p.heart_disease,
            "asthma": p.asthma,
            "chronic_kidney_disease": p.chronic_kidney_disease,
            "previous_stroke": p.previous_stroke,
            "smoker": p.smoker,
            "obese": p.obese,
            "previous_heart_attack": p.previous_heart_attack,
            "previous_hospitalization": p.previous_hospitalization,
        })

    return Response(results)


# -------------------------------
# ➕ Patient Create API
# -------------------------------

@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([AllowAny])
def patient_create(request):
    data = request.data

    full_name = data.get("full_name", "").strip()
    age = data.get("age")
    gender = data.get("gender", "").strip()

    if not full_name or not age or not gender:
        return Response(
            {"error": "full_name, age, and gender are required"},
            status=status.HTTP_400_BAD_REQUEST
        )

    patient = Patient.objects.create(
        full_name=full_name,
        age=int(age),
        gender=gender,
        blood_group=data.get("blood_group", ""),
        allergies=data.get("allergies", ""),
        past_surgeries=data.get("past_surgeries", ""),
        diabetes=data.get("diabetes", False),
        hypertension=data.get("hypertension", False),
        heart_disease=data.get("heart_disease", False),
        asthma=data.get("asthma", False),
        chronic_kidney_disease=data.get("chronic_kidney_disease", False),
        previous_stroke=data.get("previous_stroke", False),
        smoker=data.get("smoker", False),
        obese=data.get("obese", False),
        previous_heart_attack=data.get("previous_heart_attack", False),
        previous_hospitalization=data.get("previous_hospitalization", False),
    )

    return Response({
        "id": patient.id,
        "full_name": patient.full_name,
        "age": patient.age,
        "gender": patient.gender,
    }, status=status.HTTP_201_CREATED)


# -------------------------------
# 👨‍⚕️ Doctors by Department API
# -------------------------------

@api_view(['GET'])
@permission_classes([AllowAny])
def doctors_by_department(request):
    dept = request.GET.get("department", "").strip()

    all_doctors = User.objects.filter(groups__name='Doctors')

    if dept:
        # Try exact match first, then contains, then fallback to all
        matched = all_doctors.filter(staffprofile__department__iexact=dept)
        if not matched.exists():
            search_term = dept.replace("_", " ")
            matched = all_doctors.filter(staffprofile__department__icontains=search_term)
        if not matched.exists():
            matched = all_doctors  # fallback: show all doctors
    else:
        matched = all_doctors

    # Annotate with patient count (emergency + triage assignments)
    matched = matched.annotate(
        emergency_count=Count('assigned_emergencies'),
        triage_count=Count('doctor_requests'),
    )

    results = []
    for d in matched:
        try:
            dept_name = d.staffprofile.department
        except StaffProfile.DoesNotExist:
            dept_name = ""
        results.append({
            "id": d.id,
            "name": d.get_full_name() or d.username,
            "department": dept_name,
            "patient_count": d.emergency_count + d.triage_count,
        })

    # Sort by patient count (least loaded first)
    results.sort(key=lambda x: x["patient_count"])

    return Response(results)


# -------------------------------
# 🚨 Emergency Confirm API
# -------------------------------

@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([AllowAny])
def emergency_confirm(request):
    patient_id = request.data.get("patient_id")
    doctor_id = request.data.get("doctor_id")
    department = request.data.get("department", "").strip()
    symptoms = request.data.get("symptoms", "")

    if not patient_id or not doctor_id or not department:
        return Response(
            {"error": "patient_id, doctor_id, and department are required"},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        patient = Patient.objects.get(id=patient_id)
    except Patient.DoesNotExist:
        return Response({"error": "Patient not found"}, status=404)

    # Patient exclusivity: cannot be in both triage and emergency
    if TriageRequest.objects.filter(patient=patient).exists():
        return Response(
            {"error": "This patient already has a triage request. A patient cannot have both triage and emergency requests."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        doctor = User.objects.get(id=doctor_id)
    except User.DoesNotExist:
        return Response({"error": "Doctor not found"}, status=404)

    try:
        emergency = EmergencyRequest.objects.create(
            patient=patient,
            nurse=request.user,
            doctor=doctor,
            department=department,
        )
    except IntegrityError:
        return Response(
            {
                "error": "This patient already has an active emergency case."
            },
            status=status.HTTP_409_CONFLICT
        )


    return Response({
        "id": emergency.id,
        "patient": patient.full_name,
        "doctor": doctor.get_full_name() or doctor.username,
        "department": department,
        "message": "Emergency case confirmed and assigned.",
    }, status=status.HTTP_201_CREATED)


# -------------------------------
# 📋 Triage Request Create API
# -------------------------------

@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([AllowAny])
def triage_request_create(request):
    data = request.data
    patient_id = data.get("patient_id")

    if not patient_id:
        return Response({"error": "patient_id is required"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        patient = Patient.objects.get(id=patient_id)
    except Patient.DoesNotExist:
        return Response({"error": "Patient not found"}, status=404)

    # Patient exclusivity: cannot be in both triage and emergency
    if EmergencyRequest.objects.filter(patient=patient).exists():
        return Response(
            {"error": "This patient already has an emergency case. A patient cannot have both triage and emergency requests."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Vitals
    systolic_bp = data.get("systolic_bp", 0)
    heart_rate = data.get("heart_rate", 0)
    temperature = data.get("temperature", 0.0)
    oxygen = data.get("oxygen", 0)

    # Build symptom kwargs from boolean fields
    symptom_fields = [
        "chest_pain", "severe_breathlessness", "sudden_confusion",
        "stroke_symptoms", "seizure", "severe_trauma",
        "uncontrolled_bleeding", "loss_of_consciousness",
        "severe_allergic_reaction", "persistent_fever", "vomiting",
        "moderate_abdominal_pain", "persistent_cough",
        "moderate_breathlessness", "severe_headache", "dizziness",
        "dehydration", "palpitations", "migraine",
        "mild_headache", "sore_throat", "runny_nose", "mild_cough",
        "fatigue", "body_ache", "mild_abdominal_pain", "skin_rash",
        "mild_back_pain", "mild_joint_pain",
    ]

    symptom_kwargs = {}
    for field in symptom_fields:
        val = data.get(field)
        if val is not None:
            symptom_kwargs[field] = bool(val)

    model_input = {
        "Age": patient.age,
        "Gender": patient.gender,
        "Systolic_BP": systolic_bp,
        "Heart_Rate": heart_rate,
        "Temperature": temperature,
        "Oxygen": oxygen,
        "Chest_Pain": symptom_kwargs.get("chest_pain", False),
        "Severe_Breathlessness": symptom_kwargs.get("severe_breathlessness", False),
        "Sudden_Confusion": symptom_kwargs.get("sudden_confusion", False),
        "Stroke_Symptoms": symptom_kwargs.get("stroke_symptoms", False),
        "Seizure": symptom_kwargs.get("seizure", False),
        "Severe_Trauma": symptom_kwargs.get("severe_trauma", False),
        "Uncontrolled_Bleeding": symptom_kwargs.get("uncontrolled_bleeding", False),
        "Loss_of_Consciousness": symptom_kwargs.get("loss_of_consciousness", False),
        "Severe_Allergic_Reaction": symptom_kwargs.get("severe_allergic_reaction", False),
        "Persistent_Fever": symptom_kwargs.get("persistent_fever", False),
        "Vomiting": symptom_kwargs.get("vomiting", False),
        "Moderate_Abdominal_Pain": symptom_kwargs.get("moderate_abdominal_pain", False),
        "Persistent_Cough": symptom_kwargs.get("persistent_cough", False),
        "Moderate_Breathlessness": symptom_kwargs.get("moderate_breathlessness", False),
        "Severe_Headache": symptom_kwargs.get("severe_headache", False),
        "Dizziness": symptom_kwargs.get("dizziness", False),
        "Dehydration": symptom_kwargs.get("dehydration", False),
        "Palpitations": symptom_kwargs.get("palpitations", False),
        "Migraine": symptom_kwargs.get("migraine", False),
        "Mild_Headache": symptom_kwargs.get("mild_headache", False),
        "Sore_Throat": symptom_kwargs.get("sore_throat", False),
        "Runny_Nose": symptom_kwargs.get("runny_nose", False),
        "Mild_Cough": symptom_kwargs.get("mild_cough", False),
        "Fatigue": symptom_kwargs.get("fatigue", False),
        "Body_Ache": symptom_kwargs.get("body_ache", False),
        "Mild_Abdominal_Pain": symptom_kwargs.get("mild_abdominal_pain", False),
        "Skin_Rash": symptom_kwargs.get("skin_rash", False),
        "Mild_Back_Pain": symptom_kwargs.get("mild_back_pain", False),
        "Mild_Joint_Pain": symptom_kwargs.get("mild_joint_pain", False),

        "Diabetes": patient.diabetes,
        "Hypertension": patient.hypertension,
        "Heart_Disease": patient.heart_disease,
        "Asthma": patient.asthma,
        "Chronic_Kidney_Disease": patient.chronic_kidney_disease,
        "Previous_Stroke": patient.previous_stroke,
        "Smoker": patient.smoker,
        "Obese": patient.obese,
        "Previous_Heart_Attack": patient.previous_heart_attack,
        "Previous_Hospitalization": patient.previous_hospitalization,
    }

    risk_result = predict_risk(model_input)
    predicted_risk = risk_result["Risk"]
    model_input2 = {
        "Age": patient.age,
        "Gender": patient.gender,
        "Systolic_BP": systolic_bp,
        "Heart_Rate": heart_rate,
        "Temperature": temperature,
        "Oxygen": oxygen,
        "Chest_Pain": symptom_kwargs.get("chest_pain", False),
        "Severe_Breathlessness": symptom_kwargs.get("severe_breathlessness", False),
        "Sudden_Confusion": symptom_kwargs.get("sudden_confusion", False),
        "Stroke_Symptoms": symptom_kwargs.get("stroke_symptoms", False),
        "Seizure": symptom_kwargs.get("seizure", False),
        "Severe_Trauma": symptom_kwargs.get("severe_trauma", False),
        "Uncontrolled_Bleeding": symptom_kwargs.get("uncontrolled_bleeding", False),
        "Loss_of_Consciousness": symptom_kwargs.get("loss_of_consciousness", False),
        "Severe_Allergic_Reaction": symptom_kwargs.get("severe_allergic_reaction", False),
        "Persistent_Fever": symptom_kwargs.get("persistent_fever", False),
        "Vomiting": symptom_kwargs.get("vomiting", False),
        "Moderate_Abdominal_Pain": symptom_kwargs.get("moderate_abdominal_pain", False),
        "Persistent_Cough": symptom_kwargs.get("persistent_cough", False),
        "Moderate_Breathlessness": symptom_kwargs.get("moderate_breathlessness", False),
        "Severe_Headache": symptom_kwargs.get("severe_headache", False),
        "Dizziness": symptom_kwargs.get("dizziness", False),
        "Dehydration": symptom_kwargs.get("dehydration", False),
        "Palpitations": symptom_kwargs.get("palpitations", False),
        "Migraine": symptom_kwargs.get("migraine", False),
        "Mild_Headache": symptom_kwargs.get("mild_headache", False),
        "Sore_Throat": symptom_kwargs.get("sore_throat", False),
        "Runny_Nose": symptom_kwargs.get("runny_nose", False),
        "Mild_Cough": symptom_kwargs.get("mild_cough", False),
        "Fatigue": symptom_kwargs.get("fatigue", False),
        "Body_Ache": symptom_kwargs.get("body_ache", False),
        "Mild_Abdominal_Pain": symptom_kwargs.get("mild_abdominal_pain", False),
        "Skin_Rash": symptom_kwargs.get("skin_rash", False),
        "Mild_Back_Pain": symptom_kwargs.get("mild_back_pain", False),
        "Mild_Joint_Pain": symptom_kwargs.get("mild_joint_pain", False),
        "Risk": predicted_risk,
        "Diabetes": patient.diabetes,
        "Hypertension": patient.hypertension,
        "Heart_Disease": patient.heart_disease,
        "Asthma": patient.asthma,
        "Chronic_Kidney_Disease": patient.chronic_kidney_disease,
        "Previous_Stroke": patient.previous_stroke,
        "Smoker": patient.smoker,
        "Obese": patient.obese,
        "Previous_Heart_Attack": patient.previous_heart_attack,
        "Previous_Hospitalization": patient.previous_hospitalization,
    }
    prediction = predict_department(model_input2)

    predicted_department = prediction["Department"]
    confidence = prediction["Confidence"]

    triage, created = TriageRequest.objects.update_or_create(
        patient=patient,  # lookup field (OneToOne)
        defaults={
            "nurse": request.user,
            "systolic_bp": int(systolic_bp),
            "heart_rate": int(heart_rate),
            "temperature": float(temperature),
            "oxygen": int(oxygen),
            "predicted_risk": predicted_risk,
            "recommended_department": predicted_department,
            **symptom_kwargs,
        }
    )


    # Auto-assign to least-loaded doctor in department if available
    dept = predicted_department
    if dept:
        doctors = User.objects.filter(
            groups__name='Doctors'
        ).filter(
            staffprofile__department__iexact=dept
        ).annotate(
            total=Count('assigned_emergencies') + Count('doctor_requests')
        ).order_by('total')

        if doctors.exists():
            triage.assigned_doctor = doctors.first()
            triage.save()

    return Response({
        "id": triage.id,
        "patient": patient.full_name,
        "recommended_department": triage.recommended_department,
        "predicted_risk": triage.predicted_risk,
        "assigned_doctor": (
            triage.assigned_doctor.get_full_name() or triage.assigned_doctor.username
        ) if triage.assigned_doctor else None,
        "message": "Triage request created." if created else "Triage request updated."
    }, status=status.HTTP_201_CREATED)


# -------------------------------
# Resolve Triage Request
# -------------------------------

@api_view(['DELETE'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([AllowAny])
def resolve_triage_request(request, triage_id):
    if not request.user.groups.filter(name='Doctors').exists():
        return Response({"error": "Unauthorized"}, status=403)

    try:
        triage = TriageRequest.objects.get(id=triage_id, assigned_doctor=request.user)
    except TriageRequest.DoesNotExist:
        return Response({"error": "Triage request not found or not assigned to you"}, status=404)

    triage.delete()
    return Response({"message": "Triage request resolved successfully"})


# -------------------------------
# Convert Emergency to Triage
# -------------------------------

@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([AllowAny])
def convert_emergency_to_triage(request, emergency_id):
    if not request.user.groups.filter(name='Doctors').exists():
        return Response({"error": "Unauthorized"}, status=403)

    try:
        emergency = EmergencyRequest.objects.select_related('patient').get(
            id=emergency_id, doctor=request.user
        )
    except EmergencyRequest.DoesNotExist:
        return Response({"error": "Emergency request not found or not assigned to you"}, status=404)

    data = request.data
    patient = emergency.patient

    systolic_bp = data.get("systolic_bp", 0)
    heart_rate = data.get("heart_rate", 0)
    temperature = data.get("temperature", 0.0)
    oxygen = data.get("oxygen", 0)

    symptom_fields = [
        "chest_pain", "severe_breathlessness", "sudden_confusion",
        "stroke_symptoms", "seizure", "severe_trauma",
        "uncontrolled_bleeding", "loss_of_consciousness",
        "severe_allergic_reaction", "persistent_fever", "vomiting",
        "moderate_abdominal_pain", "persistent_cough",
        "moderate_breathlessness", "severe_headache", "dizziness",
        "dehydration", "palpitations", "migraine",
        "mild_headache", "sore_throat", "runny_nose", "mild_cough",
        "fatigue", "body_ache", "mild_abdominal_pain", "skin_rash",
        "mild_back_pain", "mild_joint_pain",
    ]

    symptom_kwargs = {}
    for field in symptom_fields:
        val = data.get(field)
        if val is not None:
            symptom_kwargs[field] = bool(val)

    model_input = {
        "Age": patient.age,
        "Gender": patient.gender,
        "Systolic_BP": systolic_bp,
        "Heart_Rate": heart_rate,
        "Temperature": temperature,
        "Oxygen": oxygen,
        "Chest_Pain": symptom_kwargs.get("chest_pain", False),
        "Severe_Breathlessness": symptom_kwargs.get("severe_breathlessness", False),
        "Sudden_Confusion": symptom_kwargs.get("sudden_confusion", False),
        "Stroke_Symptoms": symptom_kwargs.get("stroke_symptoms", False),
        "Seizure": symptom_kwargs.get("seizure", False),
        "Severe_Trauma": symptom_kwargs.get("severe_trauma", False),
        "Uncontrolled_Bleeding": symptom_kwargs.get("uncontrolled_bleeding", False),
        "Loss_of_Consciousness": symptom_kwargs.get("loss_of_consciousness", False),
        "Severe_Allergic_Reaction": symptom_kwargs.get("severe_allergic_reaction", False),
        "Persistent_Fever": symptom_kwargs.get("persistent_fever", False),
        "Vomiting": symptom_kwargs.get("vomiting", False),
        "Moderate_Abdominal_Pain": symptom_kwargs.get("moderate_abdominal_pain", False),
        "Persistent_Cough": symptom_kwargs.get("persistent_cough", False),
        "Moderate_Breathlessness": symptom_kwargs.get("moderate_breathlessness", False),
        "Severe_Headache": symptom_kwargs.get("severe_headache", False),
        "Dizziness": symptom_kwargs.get("dizziness", False),
        "Dehydration": symptom_kwargs.get("dehydration", False),
        "Palpitations": symptom_kwargs.get("palpitations", False),
        "Migraine": symptom_kwargs.get("migraine", False),
        "Mild_Headache": symptom_kwargs.get("mild_headache", False),
        "Sore_Throat": symptom_kwargs.get("sore_throat", False),
        "Runny_Nose": symptom_kwargs.get("runny_nose", False),
        "Mild_Cough": symptom_kwargs.get("mild_cough", False),
        "Fatigue": symptom_kwargs.get("fatigue", False),
        "Body_Ache": symptom_kwargs.get("body_ache", False),
        "Mild_Abdominal_Pain": symptom_kwargs.get("mild_abdominal_pain", False),
        "Skin_Rash": symptom_kwargs.get("skin_rash", False),
        "Mild_Back_Pain": symptom_kwargs.get("mild_back_pain", False),
        "Mild_Joint_Pain": symptom_kwargs.get("mild_joint_pain", False),
        "Diabetes": patient.diabetes,
        "Hypertension": patient.hypertension,
        "Heart_Disease": patient.heart_disease,
        "Asthma": patient.asthma,
        "Chronic_Kidney_Disease": patient.chronic_kidney_disease,
        "Previous_Stroke": patient.previous_stroke,
        "Smoker": patient.smoker,
        "Obese": patient.obese,
        "Previous_Heart_Attack": patient.previous_heart_attack,
        "Previous_Hospitalization": patient.previous_hospitalization,
    }

    risk_result = predict_risk(model_input)
    predicted_risk = risk_result["Risk"]

    model_input2 = {**model_input, "Risk": predicted_risk}
    prediction = predict_department(model_input2)
    predicted_department = prediction["Department"]

    # Check if patient already has a triage request (OneToOne constraint)
    if TriageRequest.objects.filter(patient=patient).exists():
        return Response(
            {"error": "This patient already has a triage request. Cannot convert."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        triage = TriageRequest.objects.create(
            patient=patient,
            nurse=emergency.nurse,
            assigned_doctor=request.user,
            systolic_bp=int(systolic_bp),
            heart_rate=int(heart_rate),
            temperature=float(temperature),
            oxygen=int(oxygen),
            predicted_risk=predicted_risk,
            recommended_department=predicted_department,
            **symptom_kwargs,
        )
    except IntegrityError:
        return Response(
            {"error": "A triage request already exists for this patient."},
            status=status.HTTP_409_CONFLICT,
        )

    emergency.delete()

    # Build response with full triage data
    entry = {}
    for field in triage._meta.fields:
        if field.name in ('patient', 'nurse', 'assigned_doctor'):
            continue
        entry[field.name] = getattr(triage, field.name)

    entry['patient_id'] = patient.id
    entry['patient_name'] = patient.full_name
    entry['patient_age'] = patient.age
    entry['patient_gender'] = patient.gender
    entry['patient_blood_group'] = patient.blood_group
    entry['patient_allergies'] = patient.allergies
    entry['patient_past_surgeries'] = patient.past_surgeries
    entry['patient_diabetes'] = patient.diabetes
    entry['patient_hypertension'] = patient.hypertension
    entry['patient_heart_disease'] = patient.heart_disease
    entry['patient_asthma'] = patient.asthma
    entry['patient_chronic_kidney_disease'] = patient.chronic_kidney_disease
    entry['patient_previous_stroke'] = patient.previous_stroke
    entry['patient_smoker'] = patient.smoker
    entry['patient_obese'] = patient.obese
    entry['patient_previous_heart_attack'] = patient.previous_heart_attack
    entry['patient_previous_hospitalization'] = patient.previous_hospitalization
    entry['nurse_id'] = triage.nurse_id
    entry['assigned_doctor_id'] = triage.assigned_doctor_id

    return Response(entry, status=status.HTTP_201_CREATED)


# -------------------------------
# Update Patient History
# -------------------------------

@api_view(['PATCH'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([AllowAny])
def update_patient_history(request, patient_id):
    if not request.user.groups.filter(name='Doctors').exists():
        return Response({"error": "Unauthorized"}, status=403)

    try:
        patient = Patient.objects.get(id=patient_id)
    except Patient.DoesNotExist:
        return Response({"error": "Patient not found"}, status=404)

    data = request.data
    bool_fields = [
        'diabetes', 'hypertension', 'heart_disease', 'asthma',
        'chronic_kidney_disease', 'previous_stroke', 'smoker',
        'obese', 'previous_heart_attack', 'previous_hospitalization',
    ]
    for field in bool_fields:
        if field in data:
            setattr(patient, field, bool(data[field]))

    if 'allergies' in data:
        patient.allergies = data['allergies']
    if 'past_surgeries' in data:
        patient.past_surgeries = data['past_surgeries']

    patient.save()
    return Response({"message": "Patient history updated successfully"})

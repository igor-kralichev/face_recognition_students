import base64
import json
import re
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import pytz
from datetime import datetime, timedelta

import cv2
import face_recognition
import numpy as np
from PIL import Image
from pathlib import Path
from flask import Blueprint, render_template, request, jsonify, current_app
from flask_login import login_required, current_user
from werkzeug.security import generate_password_hash

from app import db
from app.models.attendance import Attendance
from app.models.lesson import Lesson
from app.models.student import Student
from app.models.teacher import Teacher
from app.models.user import User
from app.models.group import Group
from app.views.auth import role_required

teacher_bp = Blueprint('teacher', __name__, url_prefix='/auth/teacher')

# Глобальные переменные для хранения известных лиц и их ID
current_known_faces = []
current_known_ids = []

# ============================================
# Приветствие и общие маршруты
# ============================================

# Отображает страницу приветствия для преподавателя
@teacher_bp.route('/hello')
@login_required
@role_required('teacher')
def hello():
    """Отображает страницу приветствия для преподавателя."""
    return render_template('teacher_hello.html', first_start=current_user.first_start, user_id=current_user.id)

# ============================================
# Управление посещаемостью
# ============================================

# Отображает дашборд с данными о посещаемости
@teacher_bp.route('/dashboard', methods=['GET'])
@login_required
@role_required('teacher')
def dashboard():
    """
    Отображает дашборд с данными о посещаемости для преподавателя.
    Поддерживает фильтрацию по предмету, группе и датам.
    Возвращает HTML или JSON в зависимости от параметра 'format'.
    """
    teacher_subjects = Teacher.query.filter_by(id_user=current_user.id).all()
    lessons = [{'id': t.lesson.id, 'lesson': t.lesson.lesson} for t in teacher_subjects]

    groups = (Group.query
              .join(Attendance, Attendance.id_group == Group.id)
              .join(Teacher, Attendance.id_teacher == Teacher.id)
              .filter(Teacher.id_user == current_user.id)
              .distinct()
              .all())
    groups_data = [{'id': g.id, 'groupname': g.groupname} for g in groups]

    lesson_id = request.args.get('lesson_id', type=int)
    group_id = request.args.get('group_id')
    group_id = int(group_id) if group_id and group_id.isdigit() else None
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')

    if request.args.get('format', '').lower() == 'json':
        query = db.session.query(
            User.fio.label('teacher_fio'),
            Lesson.lesson.label('lesson_name'),
            Group.groupname.label('groupname'),
            Student.id.label('student_id'),
            Student.fio.label('student_fio'),
            Attendance.timestamp
        ).select_from(Teacher).filter(Teacher.id_user == current_user.id
                                      ).join(User, Teacher.id_user == User.id
                                             ).join(Lesson, Teacher.id_lesson == Lesson.id
                                                    ).join(Attendance, Attendance.id_teacher == Teacher.id
                                                           ).join(Group, Attendance.id_group == Group.id
                                                                  ).outerjoin(Student,
                                                                              Attendance.id_student == Student.id)

        if lesson_id:
            query = query.filter(Lesson.id == lesson_id)
        if group_id:
            query = query.filter(Group.id == group_id)
        if date_from:
            date_from = datetime.strptime(date_from, '%Y-%m-%d')
            query = query.filter(Attendance.timestamp >= date_from)
        if date_to:
            date_to = datetime.strptime(date_to, '%Y-%m-%d')
            date_to_end = date_to + timedelta(days=1)
            query = query.filter(Attendance.timestamp < date_to_end)

        attendance_records = query.all()

        if not attendance_records:
            return jsonify({"message": "Невозможно сформировать отчёт о посещаемости по этому фильтру"}), 200

        attendance_data = {}
        for record in attendance_records:
            key = (record.teacher_fio, record.lesson_name, record.groupname)
            date_str = record.timestamp.date().strftime("%d.%m.%Y")
            if key not in attendance_data:
                attendance_data[key] = {
                    'teacher_fio': record.teacher_fio,
                    'lesson_name': record.lesson_name,
                    'groupname': record.groupname,
                    'students': {},
                    'dates': set()
                }
            attendance_data[key]['dates'].add(date_str)
            if record.student_fio:
                if record.student_fio not in attendance_data[key]['students']:
                    attendance_data[key]['students'][record.student_fio] = {}
                attendance_data[key]['students'][record.student_fio][date_str] = "✔"

        for key in attendance_data.keys():
            group = Group.query.filter_by(groupname=key[2]).first()
            if group:
                students_in_group = Student.query.filter_by(id_group=group.id).all()
                for student in students_in_group:
                    if student.fio not in attendance_data[key]['students']:
                        attendance_data[key]['students'][student.fio] = {date: "✖" for date in attendance_data[key]['dates']}
                    else:
                        for date in attendance_data[key]['dates']:
                            if date not in attendance_data[key]['students'][student.fio]:
                                attendance_data[key]['students'][student.fio][date] = "✖"

        response = {
            'attendance_by_group': [
                {
                    'teacher_fio': data['teacher_fio'],
                    'lesson_name': data['lesson_name'],
                    'groupname': data['groupname'],
                    'students': [
                        {'fio': fio, 'attendance': {date: att.get(date, "✖") for date in sorted(data['dates'])}}
                        for fio, att in data['students'].items()
                    ],
                    'dates': sorted(data['dates'])
                } for data in attendance_data.values()
            ]
        }
        return jsonify(response)

    return render_template('teacher_dashboard.html', lessons=lessons, groups=groups_data)

# Возвращает данные о посещаемости для группы и даты
@teacher_bp.route('/api/attendance', methods=['GET'])
@login_required
@role_required('teacher')
def get_attendance():
    """
    Возвращает данные о посещаемости для конкретной группы и даты.
    Используется для получения списка студентов с отметками о присутствии.
    """
    group_id = request.args.get('group_id')
    selected_date = request.args.get('date')

    students = Student.query.filter_by(id_group=group_id).all()
    selected_date_obj = datetime.strptime(selected_date, "%d.%m.%Y").date()

    teacher = Teacher.query.filter_by(id_user=current_user.id).first()
    attendance_records = Attendance.query.filter(
        Attendance.id_group == group_id,
        db.func.date(Attendance.timestamp) == selected_date_obj,
        Attendance.id_teacher == teacher.id
    ).all()

    attendance_dict = {record.id_student: True for record in attendance_records if record.id_student}

    response = {
        "group_id": group_id,
        "date": selected_date,
        "students": [
            {"fio": student.fio, "present": "✔" if student.id in attendance_dict else "✖"}
            for student in students
        ]
    }
    return jsonify(response)

# ============================================
# Дополнительные API для фильтров
# ============================================

# Возвращает группы для указанного предмета
@teacher_bp.route('/api/get_groups_by_lesson', methods=['GET'])
@login_required
@role_required('teacher')
def get_groups_by_lesson():
    """Возвращает список групп для указанного предмета."""
    lesson_id = request.args.get('lesson_id', type=int)
    if lesson_id:
        groups = Group.query.join(Student).join(Attendance).join(Teacher).filter(
            Teacher.id_lesson == lesson_id,
            Teacher.id_user == current_user.id
        ).distinct().all()
        return jsonify([{'id': group.id, 'name': group.groupname} for group in groups])
    return jsonify([])

# Возвращает предметы текущего преподавателя
@teacher_bp.route('/api/get_lessons_by_teacher', methods=['GET'])
@login_required
@role_required('teacher')
def get_lessons_by_teacher():
    """Возвращает список предметов для текущего преподавателя."""
    lessons = Lesson.query.join(Teacher).filter(Teacher.id_user == current_user.id).all()
    return jsonify([{'id': lesson.id, 'name': lesson.lesson} for lesson in lessons])

# Возвращает группы текущего преподавателя
@teacher_bp.route('/api/get_groups_by_teacher', methods=['GET'])
@login_required
@role_required('teacher')
def get_groups_by_teacher():
    """Возвращает список групп для текущего преподавателя."""
    groups = Group.query.join(Attendance).join(Teacher).filter(
        Teacher.id_user == current_user.id
    ).distinct().all()
    return jsonify([{'id': group.id, 'name': group.groupname} for group in groups])

# Возвращает предметы для указанной группы
@teacher_bp.route('/api/get_lessons_by_group', methods=['GET'])
@login_required
@role_required('teacher')
def get_lessons_by_group():
    """Возвращает список предметов для указанной группы."""
    group_id = request.args.get('group_id', type=int)
    if group_id:
        lessons = Lesson.query.join(Teacher).join(Attendance).filter(
            Attendance.id_group == group_id,
            Teacher.id_user == current_user.id
        ).distinct().all()
        return jsonify([{'id': lesson.id, 'name': lesson.lesson} for lesson in lessons])
    return jsonify([])

# ============================================
# Распознавание лиц и отметка посещаемости
# ============================================

# Отображает страницу для отметки посещаемости
@teacher_bp.route('/take_attendance')
@login_required
@role_required('teacher')
def take_attendance():
    """
    Отображает страницу для отметки посещаемости.
    Позволяет выбрать предмет и группу для распознавания лиц.
    """
    teacher_subjects = Teacher.query.filter_by(id_user=current_user.id).all()
    subjects = [{'id': t.lesson.id, 'name': t.lesson.lesson} for t in teacher_subjects]
    groups = Group.query.all()
    groups_data = [{'id': g.id, 'groupname': g.groupname} for g in groups]

    return render_template(
        'teacher_attendance.html',
        subjects=subjects,
        groups=groups_data,
        first_start=current_user.first_start,
        user_id=current_user.id
    )

# Отправляет email студенту об отсутствии
def send_absence_email(student, subject_name, teacher_fio):
    """
    Отправляет email студенту об отсутствии на занятии.
    Использует конфигурацию почты из приложения.
    """
    mail_host = current_app.config.get("MAIL_HOST")
    mail_port = current_app.config.get("MAIL_PORT")
    mail_username = current_app.config.get("MAIL_USERNAME")
    mail_password = current_app.config.get("MAIL_PASSWORD")
    mail_from = current_app.config.get("MAIL_FROM")

    message = MIMEMultipart("alternative")
    message["Subject"] = "Отсутствие на занятии"
    message["From"] = mail_from
    message["To"] = student.mail

    text = (f"Уважаемый(ая) {student.fio},\n\n"
            f"Вы отсутствовали на занятии по предмету {subject_name} у преподавателя {teacher_fio}.\n"
            "Просьба предоставить документ, подтверждающий уважительную причину пропуска занятия.\n\n"
            "С уважением,\nВаше учебное заведение.")
    html = f"""\
    <html>
      <body>
        <p>Уважаемый(ая) {student.fio},<br><br>
           Вы отсутствовали на занятии по предмету <strong>{subject_name}</strong> у преподавателя <strong>{teacher_fio}</strong>.<br>
           Просьба предоставить документ, подтверждающий уважительную причину пропуска занятия.<br><br>
           С уважением,<br>
           Ваше учебное заведение.
        </p>
      </body>
    </html>
    """
    part1 = MIMEText(text, "plain")
    part2 = MIMEText(html, "html")
    message.attach(part1)
    message.attach(part2)

    context = ssl.create_default_context()
    try:
        with smtplib.SMTP_SSL(mail_host, mail_port, context=context) as server:
            server.login(mail_username, mail_password)
            server.sendmail(mail_from, student.mail, message.as_string())
        print(f"Письмо отправлено студенту: {student.fio} ({student.mail})")
    except Exception as e:
        print(f"Ошибка отправки письма студенту {student.fio}: {e}")

# Сохраняет данные о посещаемости в базе данных
@teacher_bp.route('/api/submit_attendance', methods=['POST'])
@login_required
@role_required('teacher')
def submit_attendance():
    """
    Обрабатывает отправку данных о посещаемости.
    Сохраняет записи в базе данных на основе JSON-данных.
    """
    data = request.get_json()
    if not data or 'subject_id' not in data or 'group_id' not in data:
        return jsonify({"success": False, "message": "Нет данных о предмете или группе"}), 400

    subject_id = data.get("subject_id")
    group_id = data.get("group_id")
    teacher_record = Teacher.query.filter_by(id_user=current_user.id, id_lesson=subject_id).first()
    if not teacher_record:
        return jsonify({"success": False, "message": "Запись преподавателя не найдена"}), 400

    # Получите предмет и ФИО преподавателя для письма
    subject = Lesson.query.get(subject_id)
    if not subject:
        return jsonify({"success": False, "message": "Предмет не найден"}), 400
    teacher = User.query.get(current_user.id)
    teacher_fio = teacher.fio if teacher else "Преподаватель"

    moscow_tz = pytz.timezone("Europe/Moscow")
    timestamp = datetime.now(moscow_tz)
    students_data = data.get("students", [])
    attended_ids = []

    # Получите всех студентов в группе
    all_students = Student.query.filter_by(id_group=group_id).all()
    all_student_ids = {student.id for student in all_students}

    # Сохраните данные о присутствующих
    for student in students_data:
        if student.get("attended"):
            student_id = int(student.get("id"))
            if not Student.query.get(student_id):
                continue
            attendance = Attendance(
                timestamp=timestamp,
                id_teacher=teacher_record.id,
                id_student=student_id,
                id_group=group_id
            )
            db.session.add(attendance)
            attended_ids.append(student_id)

    if not attended_ids:
        attendance = Attendance(
            timestamp=timestamp,
            id_teacher=teacher_record.id,
            id_student=None,
            id_group=group_id
        )
        db.session.add(attendance)

    try:
        db.session.commit()

        # Найдите отсутствующих студентов
        absent_student_ids = all_student_ids - set(attended_ids)
        for student_id in absent_student_ids:
            student = Student.query.get(student_id)
            if student and student.mail:  # Убедитесь, что у студента есть email
                send_absence_email(student, subject.lesson, teacher_fio)

        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)}), 400

# Загружает кодировки лиц студентов для группы
@teacher_bp.route('/api/load_faces', methods=['GET'])
@login_required
@role_required('teacher')
def load_faces():
    """
    Загружает кодировки лиц студентов для указанной группы.
    Подготавливает данные для распознавания лиц.
    """
    group_name = request.args.get('group')
    students = Student.query.join(Group).filter(Group.groupname == group_name).all()
    known_faces = []
    known_ids = []
    for student in students:
        if student.face_encoding:
            try:
                encoding_list = json.loads(student.face_encoding)
                encoding_array = np.array(encoding_list)
                known_faces.append(encoding_array)
                known_ids.append(student.id)
            except Exception as e:
                print(f"Ошибка при загрузке кодировки для студента {student.id}: {e}")
    global current_known_faces, current_known_ids
    current_known_faces = known_faces
    current_known_ids = known_ids
    return jsonify({'success': True, 'message': f'Загружено {len(known_ids)} лиц для группы {group_name}'})

# Загружает лица из файловой системы для группы
# def load_known_faces_for_group(group_name):
#     """
#     Загружает известные лица из файловой системы для группы.
#     Используется как альтернативный способ загрузки лиц.
#     """
#     known_faces = []
#     known_ids = []
#     group_folder = Path(current_app.config['UPLOAD_FOLDER']) / group_name
#     if not group_folder.exists():
#         print(f"Папка для группы {group_name} не найдена!")
#         return known_faces, known_ids
#
#     for file in group_folder.iterdir():
#         if file.suffix.lower() in ['.jpg', '.jpeg', '.png']:
#             try:
#                 image = Image.open(file)
#                 image_np = np.array(image)
#                 encodings = face_recognition.face_encodings(image_np)
#                 if encodings:
#                     known_faces.append(encodings[0])
#                     student_id = file.stem.split('_')[0]
#                     known_ids.append(student_id)
#             except Exception as e:
#                 print(f"Ошибка при обработке файла {file}: {e}")
#     return known_faces, known_ids

# Распознает лица на изображении
@teacher_bp.route('/api/recognize', methods=['POST'])
@login_required
@role_required('teacher')
def recognize():
    """
    Распознает лица на изображении и возвращает данные о студентах.
    Принимает base64-изображение, возвращает список распознанных лиц и их координаты.
    """
    try:
        data = request.json
        image_data = data.get('image')
        if not image_data:
            return jsonify({"error": "No image data provided"}), 400

        header, encoded = image_data.split(',', 1)
        image_bytes = base64.b64decode(encoded)
        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            return jsonify({"error": "Failed to decode image"}), 400

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        face_locations = face_recognition.face_locations(rgb_frame)
        face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)
        recognized_students = []

        if not face_encodings:
            return jsonify({"recognized": [], "face_locations": []})

        if not current_known_faces or not current_known_ids:
            return jsonify({"error": "No known faces loaded. Call /api/load_faces first."}), 400

        for encoding in face_encodings:
            matches = face_recognition.compare_faces(current_known_faces, encoding)
            if True in matches:
                first_match_index = matches.index(True)
                student_id = current_known_ids[first_match_index]
                student = Student.query.get(student_id)
                if student:
                    recognized_students.append({"id": student_id, "fio": student.fio})

        formatted_locations = [[top, right, bottom, left] for (top, right, bottom, left) in face_locations]
        return jsonify({'recognized': recognized_students, 'face_locations': formatted_locations})

    except Exception as e:
        print(f"Error in recognize: {str(e)}")
        return jsonify({"error": str(e)}), 500

# ============================================
# Управление пользователями
# ============================================

# Проверяет надёжность пароля
def is_password_strong(password):
    """
    Проверяет, является ли пароль достаточно сильным.
    Требует минимум 8 символов, буквы верхнего и нижнего регистра, и спецсимвол.
    """
    return (
        len(password) >= 8 and
        re.search(r'[A-Z]', password) and
        re.search(r'[a-z]', password) and
        re.search(r'[\W_]', password)
    )

# Обновляет пароль пользователя
@teacher_bp.route("/api/update_password/<int:user_id>", methods=["POST"])
@login_required
def update_password(user_id):
    """
    Обновляет пароль пользователя по его ID.
    Проверяет силу пароля и сбрасывает флаг first_start.
    """
    data = request.json
    if not data or "new_password" not in data:
        return jsonify({"success": False, "message": "Новый пароль не передан"}), 400

    new_password = data["new_password"]
    if not is_password_strong(new_password):
        return jsonify({"success": False, "message": "Пароль слишком слабый"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"success": False, "message": "Пользователь не найден"}), 404

    if user.id == current_user.id and user.first_start:
        user.first_start = False

    user.password = generate_password_hash(new_password, method='pbkdf2:sha256', salt_length=8)
    db.session.commit()
    return jsonify({"success": True})

# Возвращает список студентов с фильтрацией
@teacher_bp.route('/api/students', methods=['GET'])
@login_required
@role_required('teacher')
def get_students():
    """
    Возвращает список студентов с фильтрацией по группе.
    Используется для отображения информации о студентах.
    """
    group_name = request.args.get('group')
    query = Student.query
    if group_name:
        group_obj = Group.query.filter_by(groupname=group_name).first()
        if group_obj:
            query = query.filter_by(id_group=group_obj.id)
        else:
            return jsonify({'success': True, 'students': []})
    students = query.all()
    result = [{
        'id': student.id,
        'student_id_display': f"{'Б' if student.education_form == 'бюджетная' else 'В'}{str(student.id)[:2]}-{str(student.id)[2:]}",
        'fio': student.fio,
        'group': student.group.groupname,
        'mail': student.mail,
        'birth_date': student.birth_date.strftime('%Y-%m-%d')
    } for student in students]
    return jsonify({'success': True, 'students': result})
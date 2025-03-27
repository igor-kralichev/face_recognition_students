import logging
import os
from datetime import datetime, timedelta
import json
import face_recognition
from flask import Blueprint, render_template, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash

import re

from app.forms.register_form import RegisterForm
from app.models.role import Role
from app.views.auth import role_required
from app import db
from app.models.attendance import Attendance
from app.models.group import Group
from app.models.student import Student
from app.models.teacher import Teacher
from app.models.lesson import Lesson
from app.models.user import User

# Создание Blueprint для маршрутов администратора
admin_bp = Blueprint('admin', __name__, url_prefix='/auth/admin')

def custom_secure_filename(filename):
    """
    Сохраняет кириллицу, удаляя недопустимые символы.
    Заменяет пробелы на подчеркивания и оставляет только буквы, цифры, дефис, точку и подчеркивание.
    """
    filename = filename.strip().replace(' ', '_')
    return re.sub(r'(?u)[^-\w.]', '', filename)

# ============================================
# Приветствие и общие маршруты
# ============================================

@admin_bp.route('/hello')
@jwt_required()
@role_required('admin')
def hello():
    """Отображает страницу приветствия для администратора."""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    return render_template('admin_hello.html', first_start=user.first_start, user_id=user.id, current_user=user)
# ============================================
# Управление посещаемостью
# ============================================

@admin_bp.route('/dashboard', methods=['GET'])
@jwt_required()
@role_required('admin')
def dashboard():
    """
    Отображает дашборд с данными о посещаемости.
    Поддерживает фильтрацию по преподавателю, предмету, группе и датам.
    Возвращает HTML или JSON в зависимости от параметра 'format'.
    """
    teacher_id = request.args.get('teacher_id', type=int)
    lesson_id = request.args.get('lesson_id', type=int)
    group_id = request.args.get('group_id')
    group_id = int(group_id) if group_id and group_id.isdigit() else None
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    teachers = User.query.filter(User.role.has(rolename='teacher')).distinct(User.id).all()

    if request.args.get('format', '').lower() == 'json':
        query = db.session.query(
            User.fio.label('teacher_fio'),
            Lesson.lesson.label('lesson_name'),
            Group.groupname.label('groupname'),
            Student.id.label('student_id'),
            Student.fio.label('student_fio'),
            Attendance.timestamp
        ).select_from(Teacher).join(User, Teacher.id_user == User.id
                                    ).join(Lesson, Teacher.id_lesson == Lesson.id
                                           ).join(Attendance, Attendance.id_teacher == Teacher.id
                                                  ).join(Group, Attendance.id_group == Group.id
                                                         ).outerjoin(Student, Attendance.id_student == Student.id)

        if teacher_id:
            query = query.filter(Teacher.id_user == teacher_id)
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
                        attendance_data[key]['students'][student.fio] = {date: "✖" for date in
                                                                         attendance_data[key]['dates']}
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

    return render_template('admin_dashboard.html', teachers=teachers, lessons=[], groups=[])

@admin_bp.route('/api/attendance', methods=['GET'])
@jwt_required()
@role_required('admin')
def get_attendance():
    """
    Возвращает данные о посещаемости для конкретной группы и даты.
    Используется для получения списка студентов с отметками о присутствии.
    """
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user or user.role.rolename != 'admin':
        return jsonify({"message": "Доступ запрещён"}), 403

    group_id = request.args.get('group_id')
    selected_date = request.args.get('date')
    students = Student.query.filter_by(id_group=group_id).all()
    selected_date_obj = datetime.strptime(selected_date, "%d.%m.%Y").date()
    attendance_records = Attendance.query.filter(
        Attendance.id_student.in_([student.id for student in students]),
        db.func.date(Attendance.timestamp) == selected_date_obj
    ).all()
    attendance_dict = {record.id_student: True for record in attendance_records}
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

@admin_bp.route('/api/get_lessons_by_group', methods=['GET'])
@jwt_required()
@role_required('admin')
def get_lessons_by_group():
    """Возвращает список предметов для указанной группы."""
    group_id = request.args.get('group_id', type=int)
    if group_id:
        lessons = Lesson.query.join(Teacher).join(Attendance).filter(
            Attendance.id_group == group_id
        ).distinct().all()
        return jsonify([{'id': lesson.id, 'name': lesson.lesson} for lesson in lessons])
    return jsonify([])

@admin_bp.route('/api/get_groups_by_lesson', methods=['GET'])
@jwt_required()
@role_required('admin')
def get_groups_by_lesson():
    """Возвращает список групп для указанного предмета."""
    lesson_id = request.args.get('lesson_id', type=int)
    if lesson_id:
        groups = Group.query.join(Attendance).join(Teacher).filter(
            Teacher.id_lesson == lesson_id
        ).distinct().all()
        return jsonify([{'id': group.id, 'name': group.groupname} for group in groups])
    return jsonify([])

@admin_bp.route('/api/get_groups_by_teacher', methods=['GET'])
@jwt_required()
@role_required('admin')
def get_groups_by_teacher():
    """Возвращает список групп для указанного преподавателя."""
    teacher_id = request.args.get('teacher_id', type=int)
    if teacher_id:
        groups = Group.query.join(Attendance).join(Teacher).filter(
            Teacher.id_user == teacher_id
        ).distinct().all()
        return jsonify([{'id': group.id, 'name': group.groupname} for group in groups])
    return jsonify([])

@admin_bp.route('/api/get_lessons_by_teacher', methods=['GET'])
@jwt_required()
@role_required('admin')
def get_lessons_by_teacher():
    """Возвращает список предметов для указанного преподавателя."""
    teacher_id = request.args.get('teacher_id', type=int)
    if teacher_id:
        lessons = Lesson.query.join(Teacher).filter(Teacher.id_user == teacher_id).distinct().all()
        return jsonify([{'id': lesson.id, 'name': lesson.lesson} for lesson in lessons])
    return jsonify([])

@admin_bp.route('/api/get_teachers_by_group', methods=['GET'])
@jwt_required()
@role_required('admin')
def get_teachers_by_group():
    """Возвращает список преподавателей для указанной группы."""
    group_id = request.args.get('group_id', type=int)
    if group_id:
        teachers = User.query.join(Teacher, Teacher.id_user == User.id).join(Attendance).filter(
            Attendance.id_group == group_id
        ).distinct().all()
        return jsonify([{'id': teacher.id, 'name': teacher.fio} for teacher in teachers])
    return jsonify([])

@admin_bp.route('/api/get_teachers_by_lesson', methods=['GET'])
@jwt_required()
@role_required('admin')
def get_teachers_by_lesson():
    """Возвращает список преподавателей для указанного предмета."""
    lesson_id = request.args.get('lesson_id', type=int)
    if lesson_id:
        teachers = User.query.join(Teacher, Teacher.id_user == User.id).filter(
            Teacher.id_lesson == lesson_id
        ).distinct().all()
        return jsonify([{'id': teacher.id, 'name': teacher.fio} for teacher in teachers])
    return jsonify([])

@admin_bp.route('/api/get_teachers_by_group_and_lesson', methods=['GET'])
@jwt_required()
@role_required('admin')
def get_teachers_by_group_and_lesson():
    """
    Возвращает список преподавателей, у которых есть записи посещаемости
    для указанной группы И указанного предмета.
    """
    group_id = request.args.get('group_id', type=int)
    lesson_id = request.args.get('lesson_id', type=int)
    if group_id and lesson_id:
        teachers = (User.query
                    .join(Teacher, Teacher.id_user == User.id)
                    .join(Attendance, Attendance.id_teacher == Teacher.id)
                    .filter(Attendance.id_group == group_id)
                    .filter(Teacher.id_lesson == lesson_id)
                    .distinct()
                    .all())
        return jsonify([{
            'id': t.id,
            'fio': t.fio,
            'mail': t.mail
        } for t in teachers])
    return jsonify([])

@admin_bp.route('/api/get_groups_by_teacher_and_lesson', methods=['GET'])
@jwt_required()
@role_required('admin')
def get_groups_by_teacher_and_lesson():
    """Возвращает список групп для указанного преподавателя и предмета."""
    teacher_id = request.args.get('teacher_id', type=int)
    lesson_id = request.args.get('lesson_id', type=int)
    if teacher_id and lesson_id:
        groups = Group.query.join(Attendance).join(Teacher).filter(
            Teacher.id_user == teacher_id,
            Teacher.id_lesson == lesson_id
        ).distinct().all()
        return jsonify([{'id': group.id, 'name': group.groupname} for group in groups])
    return jsonify([])

@admin_bp.route('/api/get_all_teachers', methods=['GET'])
@jwt_required()
@role_required('admin')
def get_all_teachers():
    """Возвращает список всех преподавателей для начальной загрузки фильтров."""
    teachers = User.query.filter(User.role.has(rolename='teacher')).all()
    return jsonify([{'id': teacher.id, 'fio': teacher.fio, 'mail': teacher.mail} for teacher in teachers])

@admin_bp.route('/api/get_all_lessons', methods=['GET'])
@jwt_required()
@role_required('admin')
def get_all_lessons():
    """Возвращает список всех предметов для начальной загрузки фильтров."""
    lessons = Lesson.query.all()
    return jsonify([{'id': lesson.id, 'name': lesson.lesson} for lesson in lessons])

@admin_bp.route('/api/get_all_groups', methods=['GET'])
@jwt_required()
@role_required('admin')
def get_all_groups():
    """Возвращает список всех групп для начальной загрузки фильтров."""
    groups = Group.query.all()
    return jsonify([{'id': group.id, 'name': group.groupname} for group in groups])

# ============================================
# Управление пользователями
# ============================================

@admin_bp.route('/users', methods=['GET'])
@jwt_required()
@role_required('admin')
def users_page():
    """Отображает страницу управления пользователями."""
    user_id = get_jwt_identity()
    return render_template('admin_users.html', current_user_id=user_id)

@admin_bp.route('/api/users', methods=['GET'])
@jwt_required()
@role_required('admin')
def api_get_users():
    """Возвращает список всех пользователей в формате JSON, включая mail и birth_date."""
    users = User.query.all()
    users_data = [
        {
            'id': user.id,
            'fio': user.fio,
            'login': user.login,
            'role': user.role.rolename,
            'mail': user.mail,
            'birth_date': user.birth_date.strftime('%Y-%m-%d') if user.birth_date else None
        }
        for user in users
    ]
    user_id = get_jwt_identity()
    return jsonify({'current_user': user_id, 'users': users_data})

@admin_bp.route('/api/check_password', methods=['POST'])
@jwt_required()
@role_required('admin')
def check_password():
    """Проверяет, соответствует ли введённый пароль паролю текущего пользователя."""
    data = request.get_json()
    if not data or 'password' not in data:
        return jsonify({'success': False, 'message': 'Пароль не предоставлен'}), 400
    entered_password = data['password']
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if check_password_hash(user.password, entered_password):
        return jsonify({'success': True})
    return jsonify({'success': False, 'message': 'Неверный пароль'}), 400

@admin_bp.route('/api/register_users', methods=['POST'])
@jwt_required()
@role_required('admin')
def register_users():
    """Обрабатывает регистрацию пользователей через JSON, включая mail и birth_date."""
    if request.is_json:
        data = request.json
        users = data.get('users', [])
        errors = []
        for user_data in users:
            form = RegisterForm(data=user_data)
            if form.validate():
                fio = form.fio.data.strip()
                mail = form.mail.data.strip()
                birth_date = form.birth_date.data
                login = form.login.data.strip()
                password = form.password.data
                role_name = form.role.data
                role = Role.query.filter_by(rolename=role_name).first()
                if not role:
                    errors.append(f"Роль {role_name} не найдена для {login}")
                    continue
                hashed_password = generate_password_hash(password, method='pbkdf2:sha256', salt_length=8)
                new_user = User(
                    fio=fio,
                    mail=mail,
                    birth_date=birth_date,
                    login=login,
                    password=hashed_password,
                    id_role=role.id,
                    first_start=True
                )
                db.session.add(new_user)
            else:
                for field, field_errors in form.errors.items():
                    for error in field_errors:
                        errors.append(f"{field}: {error} для {user_data.get('login', 'неизвестного пользователя')}")
        if errors:
            db.session.rollback()
            return jsonify({'success': False, 'message': '; '.join(errors)}), 400
        db.session.commit()
        return jsonify({'success': True})
    return jsonify({'success': False, 'message': 'Неверный формат данных'}), 400

def is_password_strong(password):
    """Проверяет, соответствует ли пароль требованиям безопасности."""
    return (
        len(password) >= 8 and
        re.search(r'[A-Z]', password) and
        re.search(r'[a-z]', password) and
        re.search(r'[\W_]', password)
    )

@admin_bp.route("/api/update_password/<int:user_id>", methods=["POST"])
@jwt_required()
@role_required('admin')
def update_password(user_id):
    """
    Обновляет пароль пользователя по его ID.
    Проверяет силу пароля и сбрасывает флаг first_start для текущего пользователя.
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
    current_user_id = get_jwt_identity()
    if user.id == current_user_id and user.first_start:
        user.first_start = False
    user.password = generate_password_hash(new_password, method='pbkdf2:sha256', salt_length=8)
    db.session.commit()
    return jsonify({"success": True})

@admin_bp.route('/api/delete_user/<int:user_id>', methods=['DELETE'])
@jwt_required()
@role_required('admin')
def delete_user(user_id):
    """Удаляет пользователя по ID, запрещая удаление текущего пользователя."""
    current_user_id = get_jwt_identity()
    if current_user_id == user_id:
        return jsonify({'success': False, 'message': 'Нельзя удалить текущего пользователя'}), 403
    user = User.query.get(user_id)
    if user:
        db.session.delete(user)
        db.session.commit()
        return jsonify({'success': True})
    return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404

@admin_bp.route('/api/get_logins', methods=['GET'])
@jwt_required()
@role_required('admin')
def get_logins():
    """Возвращает список всех логинов пользователей."""
    users = User.query.all()
    logins = [user.login for user in users]
    return jsonify({'logins': logins})

# ============================================
# Управление преподавателями и предметами
# ============================================

@admin_bp.route('/teachers', methods=['GET'])
@jwt_required()
@role_required('admin')
def teachers_page():
    """Отображает страницу управления преподавателями."""
    return render_template('admin_teachers.html')

@admin_bp.route('/api/teachers', methods=['GET'])
@jwt_required()
@role_required('admin')
def get_teachers():
    """Возвращает список ФИО всех преподавателей."""
    teachers = User.query.filter(User.role.has(rolename='teacher')).all()
    return jsonify([teacher.fio for teacher in teachers])

@admin_bp.route('/api/subjects', methods=['GET'])
@jwt_required()
@role_required('admin')
def get_subjects():
    """Возвращает список всех предметов."""
    subjects = Lesson.query.all()
    return jsonify([subject.lesson for subject in subjects])

@admin_bp.route('/api/teacher_subjects', methods=['GET'])
@jwt_required()
@role_required('admin')
def get_teacher_subjects():
    """Возвращает список связей преподавателей и предметов."""
    teacher_subjects = Teacher.query.all()
    return jsonify([{
        'id': ts.id,
        'user': ts.user.fio,
        'lesson': ts.lesson.lesson
    } for ts in teacher_subjects])

@admin_bp.route('/api/add_subject', methods=['POST'])
@jwt_required()
@role_required('admin')
def add_subject():
    """Добавляет новый предмет, проверяя его уникальность."""
    name = request.json['name']
    if Lesson.query.filter_by(lesson=name).first():
        return jsonify({'success': False, 'message': 'Предмет уже существует'}), 400
    subject = Lesson(lesson=name)
    db.session.add(subject)
    db.session.commit()
    return jsonify({'success': True})

@admin_bp.route('/api/add_teacher_subjects', methods=['POST'])
@jwt_required()
@role_required('admin')
def add_teacher_subjects():
    """Добавляет связи между преподавателями и предметами."""
    data = request.json
    for item in data:
        teacher = User.query.filter_by(fio=item['teacher']).first()
        subject = Lesson.query.filter_by(lesson=item['subject']).first()
        if teacher and subject:
            existing = Teacher.query.filter_by(id_user=teacher.id, id_lesson=subject.id).first()
            if existing:
                return jsonify({
                    'success': False,
                    'message': f'Связь между преподавателем "{teacher.fio}" и предметом "{subject.lesson}" уже существует.'
                }), 400
            ts = Teacher(id_user=teacher.id, id_lesson=subject.id)
            db.session.add(ts)
        else:
            return jsonify({'success': False, 'message': 'Преподаватель или предмет не найдены.'}), 400
    db.session.commit()
    return jsonify({'success': True})

@admin_bp.route('/api/delete_teacher_subject/<int:id>', methods=['DELETE'])
@jwt_required()
@role_required('admin')
def delete_teacher_subject(id):
    """Удаляет связь между преподавателем и предметом по ID."""
    ts = Teacher.query.get(id)
    if ts:
        db.session.delete(ts)
        db.session.commit()
        return jsonify({'success': True})
    return jsonify({'success': False, 'message': 'Связь не найдена'}), 404

# ============================================
# Управление студентами
# ============================================

@admin_bp.route('/students', methods=['GET'])
@jwt_required()
@role_required('admin')
def students_page():
    """Отображает страницу управления студентами."""
    return render_template('admin_students.html')

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'photos')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

def allowed_file(filename):
    """Проверяет, допустим ли формат файла для загрузки."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@admin_bp.route('/api/groups', methods=['GET'])
@jwt_required()
@role_required('admin')
def get_groups():
    """Возвращает список всех групп."""
    groups = Group.query.all()
    return jsonify([{'id': group.id, 'groupname': group.groupname} for group in groups])

@admin_bp.route('/api/students', methods=['GET'])
@jwt_required()
@role_required('admin')
def get_students():
    """Возвращает список студентов с возможностью фильтрации по группе."""
    group_id = request.args.get('group_id')
    query = Student.query
    if group_id:
        query = query.filter_by(id_group=group_id)
    students = query.all()
    return jsonify([{
        'id': student.id,
        'student_id_display': f"{'Б' if student.education_form == 'бюджетная' else 'В'}{str(student.id)[:2]}-{str(student.id)[2:]}",
        'fio': student.fio,
        'group': student.group.groupname,
        'mail': student.mail,
        'birth_date': student.birth_date.strftime('%Y-%m-%d')
    } for student in students])

@admin_bp.route('/api/add_group', methods=['POST'])
@jwt_required()
@role_required('admin')
def add_group():
    """Добавляет новую группу, проверяя её уникальность."""
    name = request.json['groupname']
    if Group.query.filter_by(groupname=name).first():
        return jsonify({'success': False, 'message': 'Группа уже существует'}), 400
    group = Group(groupname=name)
    db.session.add(group)
    db.session.commit()
    return jsonify({'success': True, 'id': group.id})

logging.basicConfig(level=logging.DEBUG)

@admin_bp.route('/api/check_duplicates', methods=['POST'])
@jwt_required()
@role_required('admin')
def check_duplicates():
    """
    Проверяет на дубликаты студенческих ID и почты при добавлении студентов.
    Возвращает ошибку, если находит дубликаты.
    """
    logging.debug("Получен запрос на /api/check_duplicates")
    logging.debug(f"Данные формы: {request.form}")
    i = 0
    while f'students[{i}][student_id]' in request.form:
        student_id = request.form.get(f'students[{i}][student_id]')
        mail = request.form.get(f'students[{i}][mail]')
        logging.debug(f"Проверка студента {i}: student_id={student_id}, mail={mail}")
        if Student.query.filter_by(id=student_id).first():
            logging.warning(f"Найден дубликат студенческого билета: {student_id}")
            return jsonify(
                {'success': False, 'message': f'Такой студенческий билет {student_id} уже есть в базе данных.'}), 400
        if Student.query.filter_by(mail=mail).first():
            logging.warning(f"Найден дубликат почты: {mail}")
            return jsonify({'success': False, 'message': f'Пользователь с почтой {mail} уже есть в базе данных.'}), 400
        i += 1
    if i == 0:
        logging.error("Не найдено ни одного студента в запросе")
        return jsonify({'success': False, 'message': 'Не предоставлено ни одного студента для проверки'}), 400
    logging.debug("Проверка на дубликаты успешно завершена")
    return jsonify({'success': True})

@admin_bp.route('/api/add_students', methods=['POST'])
@jwt_required()
@role_required('admin')
def add_students():
    """Добавляет новых студентов в указанную группу, сохраняя фото и кодировки лиц."""
    group_id = request.form.get('group_id')
    group = Group.query.get(group_id)
    if not group:
        return jsonify({'success': False, 'message': 'Группа не найдена'}), 400
    group_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], custom_secure_filename(group.groupname))
    if not os.path.exists(group_folder):
        os.makedirs(group_folder, exist_ok=True)
    i = 0
    while f'students[{i}][student_id]' in request.form:
        student_id = request.form.get(f'students[{i}][student_id]')
        education_form = request.form.get(f'students[{i}][education_form]')
        fio = request.form.get(f'students[{i}][fio]')
        mail = request.form.get(f'students[{i}][mail]')
        birth_date = request.form.get(f'students[{i}][birth_date]')
        photo = request.files.get(f'students[{i}][photo]')
        new_filename = None
        face_encoding = None
        if photo:
            ext = os.path.splitext(photo.filename)[1]
            new_filename = f"{student_id}_{custom_secure_filename(fio)}{ext}"
            upload_path = os.path.join(group_folder, new_filename)
            try:
                photo.save(upload_path)
                image = face_recognition.load_image_file(upload_path)
                encodings = face_recognition.face_encodings(image)
                if encodings:
                    face_encoding = json.dumps(encodings[0].tolist())
            except Exception as e:
                db.session.rollback()
                return jsonify({'success': False, 'message': f'Ошибка сохранения файла: {e}'}), 400
        student = Student(
            id=student_id,
            fio=fio,
            mail=mail,
            photo_path=new_filename if new_filename else '',
            birth_date=birth_date,
            education_form=education_form,
            id_group=group_id,
            face_encoding=face_encoding
        )
        db.session.add(student)
        i += 1
    try:
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 400

@admin_bp.route('/api/delete_student/<string:student_id>', methods=['DELETE'])
@jwt_required()
@role_required('admin')
def delete_student(student_id):
    """Удаляет студента по ID, удаляя также его фото из файловой системы."""
    student = Student.query.get(student_id)
    if not student:
        return jsonify({"success": False, "message": "Студент не найден"}), 404
    group_folder = student.group.groupname if student.group else ""
    photo_full_path = os.path.join(current_app.config['UPLOAD_FOLDER'], group_folder, student.photo_path)
    if os.path.exists(photo_full_path):
        os.remove(photo_full_path)
    db.session.delete(student)
    db.session.commit()
    return jsonify({"success": True})
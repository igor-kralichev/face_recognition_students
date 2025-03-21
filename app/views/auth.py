from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_required, current_user, login_user, logout_user
from werkzeug.security import check_password_hash
from functools import wraps

from app.models.user import User

auth_bp = Blueprint('auth', __name__)

# ============================================
# Декораторы
# ============================================

# Декоратор, который запрещает доступ неавторизованным пользователям
def role_required(*roles):
    """
    Декоратор, который проверяет, что текущий пользователь авторизован
    и его роль входит в указанный список roles.
    """
    def wrapper(f):
        @wraps(f)
        @login_required  # Требуем, чтобы пользователь был авторизован
        def decorated_view(*args, **kwargs):
            # Используем current_user от Flask-Login
            if current_user.role.rolename not in roles:
                flash("Доступ запрещён", "error")
                return redirect(url_for('auth.login'))
            return f(*args, **kwargs)
        return decorated_view
    return wrapper

# ============================================
# Маршруты авторизации
# ============================================

# Перенаправляет на страницу входа
@auth_bp.route('/')
def redirect_to_login():
    """
    Перенаправляет пользователя на страницу логина.
    Используется как точка входа для неавторизованных пользователей.
    """
    return redirect(url_for('auth.login'))

# Обрабатывает вход пользователя
@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    """
    Логика авторизации:
    1. При GET — рендерим шаблон login.html для отображения формы входа.
    2. При POST — получаем логин и пароль из формы, ищем пользователя в базе данных,
       проверяем хэш пароля с помощью check_password_hash.
    3. Если данные верны — авторизуем пользователя через login_user и перенаправляем
       в зависимости от его роли. Иначе — показываем ошибку.
    """
    if current_user.is_authenticated:
        # Если пользователь уже авторизован, перенаправляем в зависимости от роли
        if current_user.role.rolename == 'admin':
            return redirect(url_for('admin.hello'))
        elif current_user.role.rolename == 'teacher':
            return redirect(url_for('teacher.hello'))
        else:
            return "Неизвестная роль", 403

    if request.method == 'POST':
        login = request.form.get('login')
        password = request.form.get('password')

        # Ищем пользователя в БД по логину
        user = User.query.filter_by(login=login).first()

        if user and check_password_hash(user.password, password):
            # Авторизуем пользователя через Flask-Login
            login_user(user)

            # Редирект в зависимости от роли
            if user.role.rolename == 'admin':
                return redirect(url_for('admin.hello'))
            elif user.role.rolename == 'teacher':
                return redirect(url_for('teacher.hello'))
            else:
                return "Неизвестная роль", 403
        else:
            # Если пользователь не найден или пароль неверный
            flash("Неверный логин или пароль", "error")
            return render_template('login.html')

    # Если GET-запрос — просто рендерим шаблон
    return render_template('login.html')

# Обрабатывает выход пользователя
@auth_bp.route('/logout')
@login_required
def logout():
    """
    Логика выхода из аккаунта:
    1. Завершаем сессию пользователя с помощью logout_user.
    2. Показываем сообщение об успешном выходе и перенаправляем на страницу входа.
    """
    logout_user()
    flash("Вы успешно вышли из аккаунта", "success")
    return redirect(url_for('auth.login'))
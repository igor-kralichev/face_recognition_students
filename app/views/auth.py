from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, make_response
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity, set_access_cookies, \
    unset_jwt_cookies, get_jwt
from werkzeug.security import check_password_hash
from functools import wraps

from app.models.user import User

auth_bp = Blueprint('auth', __name__)


# ============================================
# Декораторы
# ============================================

def role_required(*roles):
    """
    Декоратор, который проверяет, что текущий пользователь авторизован через JWT
    и его роль входит в указанный список roles.
    """

    def wrapper(f):
        @wraps(f)
        @jwt_required()  # Требуем JWT-токен
        def decorated_view(*args, **kwargs):
            user_id = get_jwt_identity()
            user = User.query.get(int(user_id))
            claims = get_jwt()
            if not user:
                flash("Пользователь не найден", "error")
                return redirect(url_for('auth.login'))
            if claims.get('role') not in roles:
                flash("Доступ запрещён", "error")
                return redirect(url_for('auth.login'))
            return f(*args, **kwargs)

        return decorated_view

    return wrapper


# ============================================
# Маршруты авторизации
# ============================================

@auth_bp.route('/')
def redirect_to_login():
    """
    Перенаправляет пользователя на страницу логина.
    """
    return redirect(url_for('auth.login'))


@auth_bp.route('/login', methods=['GET'])
def login():
    """
    Рендерит страницу логина. Вход обрабатывается через JavaScript и /api/login.
    """
    return render_template('login.html')


@auth_bp.route('/api/login', methods=['POST'])
def api_login():
    """
    Эндпоинт для получения JWT-токена через API.
    Принимает JSON с логином и паролем, возвращает токен при успешной аутентификации.
    """
    if not request.is_json:
        return jsonify({"msg": "Неверный формат данных, ожидается JSON"}), 400

    data = request.get_json()
    login = data.get('login')
    password = data.get('password')

    user = User.query.filter_by(login=login).first()

    if user and check_password_hash(user.password, password):
        # Генерация JWT токена
        access_token = create_access_token(
            identity=str(user.id),
            additional_claims={'role': user.role.rolename}  # Добавляем роль в токен
        )
        # Отправляем токен в заголовке Authorization
        response = jsonify({"msg": "Успешная аутентификация", "access_token": access_token})
        set_access_cookies(response, access_token)  # Устанавливаем токен в cookie
        return response, 200
    else:
        return jsonify({"msg": "Неверный логин или пароль"}), 401


# Проверка пользователя с бд
@auth_bp.route('/api/current_user', methods=['GET'])
@jwt_required()
def get_current_user():
    current_token = get_jwt()
    try:
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        if user:
            return jsonify({
                'id': user.id,
                'fio': user.fio,
                'role': user.role.rolename
            })
        return jsonify({'message': 'Пользователь не найден'}), 404
    except Exception as e:
        return jsonify({'message': f"Ошибка при обработке запроса: {str(e)}"}), 422


@auth_bp.route('/logout')
def logout():
    """
    Логика выхода: JWT хранится на клиенте, просто перенаправляем на страницу входа.
    Клиент должен удалить токен из localStorage.
    """
    response = redirect(url_for('auth.login'))
    unset_jwt_cookies(response)  # Удаляем JWT-куки
    flash("Вы успешно вышли из аккаунта", "success")
    return response

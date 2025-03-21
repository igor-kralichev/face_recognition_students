from flask import Flask, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from config import Config
from flask_login import LoginManager
from flask_wtf.csrf import CSRFProtect, generate_csrf

# Инициализация глобальных объектов для работы с базой данных
db = SQLAlchemy()
migrate = Migrate()


def create_app():
    # Создаем экземпляр Flask-приложения
    app = Flask(__name__)

    # Загружаем конфигурацию из класса Config
    app.config.from_object(Config)

    # Инициализация LoginManager для управления сессиями пользователей
    login_manager = LoginManager()
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'  # Указываем маршрут для страницы входа

    # Инициализация SQLAlchemy и Migrate для работы с базой данных
    db.init_app(app)
    migrate.init_app(app, db)

    # Инициализация CSRFProtect для защиты от CSRF-атак
    csrf = CSRFProtect(app)

    # Добавляем CSRF-токен в контекст шаблонов
    @app.context_processor
    def inject_csrf_token():
        return dict(csrf_token=generate_csrf())

    # Импорт моделей (необходимо для работы с базой данных)
    from app.models.user import User

    # Функция загрузки пользователя для Flask-Login
    @login_manager.user_loader
    def load_user(user_id):
        user = User.query.get(int(user_id))
        return user

    # Регистрация blueprints для организации маршрутов по модулям
    from app.views.auth import auth_bp
    from app.views.admin import admin_bp
    from app.views.teacher import teacher_bp
    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(admin_bp)
    app.register_blueprint(teacher_bp)

    # Перенаправление на страницу авторизации (точка входа в приложение)
    @app.route('/')
    def redirect_to_login():
        return redirect(url_for('auth.login'))

    # Импортируем утилиты для начальной настройки ролей и администратора
    from app.utils import init_roles, init_admin

    # Используем app_context для операций с базой данных
    with app.app_context():
        db.create_all()  # Создаем таблицы, если их нет
        init_roles()  # Инициализируем роли
        init_admin()  # Инициализируем администратора

    return app
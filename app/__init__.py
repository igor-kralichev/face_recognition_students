from flask import Flask, redirect, url_for
from flask_jwt_extended import JWTManager
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from config import Config

# Инициализация глобальных объектов
db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()

def create_app():
    # Создаем экземпляр Flask-приложения
    app = Flask(__name__)

    # Загружаем конфигурацию из класса Config
    app.config.from_object(Config)

    # Инициализация jwt
    jwt.init_app(app)

    # Инициализация SQLAlchemy и Migrate для работы с базой данных
    db.init_app(app)
    migrate.init_app(app, db)

    # Импорт моделей
    from app.models.user import User

    # Регистрация blueprints
    from app.views.auth import auth_bp
    from app.views.admin import admin_bp
    from app.views.teacher import teacher_bp
    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(admin_bp)
    app.register_blueprint(teacher_bp)

    # Перенаправление на страницу авторизации
    @app.route('/')
    def redirect_to_login():
        return redirect(url_for('auth.login'))

    # Импортируем утилиты для начальной настройки
    from app.utils import init_roles, init_admin

    # Используем app_context для операций с базой данных
    with app.app_context():
        db.create_all()  # Создаем таблицы, если их нет
        init_roles()   # Инициализируем роли
        init_admin()   # Инициализируем администратора

    return app

import os
from datetime import timedelta

from dotenv import load_dotenv

load_dotenv()  # Загружаем переменные из .env

basedir = os.path.abspath(os.path.dirname(__file__)) # Определяем местонахождение проекта


class Config:
    # Секретный ключ
    SECRET_KEY = os.getenv('SECRET_KEY', 'default_secret')

    # Настройки JWT
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'default_jwt_secret')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)  # Время жизни токена
    # Указываем, что токен будет храниться в headers
    JWT_TOKEN_LOCATION = ['cookies']

    JWT_ACCESS_COOKIE_NAME = 'access_token_cookie'
    # Отключаем куки
    JWT_COOKIE_CSRF_PROTECT = True
    JWT_SESSION_COOKIE = False

    # Подключение бд
    SQLALCHEMY_DATABASE_URI = f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Путь до папки с фото
    UPLOAD_FOLDER = os.path.join(basedir, 'app', 'static', 'photos')

    # Получение данных почтового клиента
    MAIL_HOST = os.getenv("MAIL_HOST")
    MAIL_PORT = int(os.getenv("MAIL_PORT", 465))
    MAIL_USERNAME = os.getenv("MAIL_USERNAME")
    MAIL_FROM = os.getenv("MAIL_FROM")
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD")

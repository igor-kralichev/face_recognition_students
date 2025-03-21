import os
from dotenv import load_dotenv

load_dotenv()  # Загружаем переменные из .env

basedir = os.path.abspath(os.path.dirname(__file__)) # Определяем местонахождение проекта


class Config:
    # Секретный ключ
    SECRET_KEY = os.getenv('SECRET_KEY', 'default_secret')

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

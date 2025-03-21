from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SelectField, DateField
from wtforms.validators import DataRequired, Length, Regexp, ValidationError
from app.models.user import User

class RegisterForm(FlaskForm):
    fio = StringField('ФИО', validators=[
        DataRequired(message='Поле ФИО обязательно'),
        Length(min=2, max=150, message='ФИО должно быть от 2 до 150 символов'),
        Regexp(r'^[А-Яа-яЁё\s-]+$', message='ФИО должно содержать только кириллицу, пробелы и дефис')
    ])
    login = StringField('Логин', validators=[
        DataRequired(message='Поле логина обязательно'),
        Length(min=3, max=50, message='Логин должен быть от 3 до 50 символов'),
        Regexp(r'^[a-zA-Z0-9_]+$', message='Логин должен содержать только буквы, цифры и подчёркивание')
    ])
    password = PasswordField('Пароль', validators=[
        DataRequired(message='Поле пароля обязательно'),
        Length(min=8, message='Пароль должен быть минимум 8 символов')
    ])
    mail = StringField('Почта', validators=[
        DataRequired(message='Поле почты обязательно'),
        Length(max=255, message='Почта должна быть не более 255 символов'),
        Regexp(r'^[^@]+@[^@]+\.[^@]+$', message='Введите корректный email адрес')
    ])
    birth_date = DateField('Дата рождения', format='%Y-%m-%d', validators=[
        DataRequired(message='Поле даты рождения обязательно')
    ])
    role = SelectField('Роль', choices=[('admin', 'Администратор'), ('teacher', 'Преподаватель')],
                       validators=[DataRequired(message='Выберите роль')])

    # Проверка уникальности логина
    def validate_login(self, field):
        if User.query.filter_by(login=field.data).first():
            raise ValidationError('Пользователь с таким логином уже существует')

    # Проверка уникальности почты
    def validate_mail(self, field):
        if User.query.filter_by(mail=field.data).first():
            raise ValidationError('Пользователь с такой почтой уже существует')

    # Проверка корректности даты рождения: не из будущего и не старше 120 лет
    def validate_birth_date(self, field):
        from datetime import date
        today = date.today()
        try:
            # Преобразуем строку в дату, если это строка
            birth_date = field.data if isinstance(field.data, date) else date.fromisoformat(field.data)
        except Exception as e:
            raise ValidationError("Неверный формат даты. Ожидается ГГГГ-ММ-ДД")
        if birth_date > today:
            raise ValidationError('Дата рождения не может быть в будущем')
        # Проверяем, что возраст не превышает 120 лет
        if (today.year - birth_date.year) > 120:
            raise ValidationError('Возраст не может быть больше 120 лет')

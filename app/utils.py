from datetime import datetime
from werkzeug.security import generate_password_hash

from app import db
from app.models.user import User
from app.models.role import Role

# Создание ролей при первом старте и пустой базе данных
def init_roles():
    from app import db
    roles = ['admin', 'teacher']
    for role_name in roles:
        # Проверяем, существует ли роль
        if not Role.query.filter_by(rolename=role_name).first():
            new_role = Role(rolename=role_name)
            db.session.add(new_role)
    db.session.commit()

# Создание первого дефолтного администратора в системе
def init_admin():
    # Находим роль "админ"
    admin_role = Role.query.filter_by(rolename='admin').first()
    if not admin_role:
        print("Роль 'админ' не найдена. Сначала создайте роли.")
        return

    # Проверяем, существует ли пользователь "admin"
    if not User.query.filter_by(login='admin').first():
        # Хешируем пароль "admin"
        hashed_password = generate_password_hash('admin', method='pbkdf2:sha256')
        # Преобразуем строку даты рождения "01.01.2000" в объект date
        birth_date = datetime.strptime('01.01.2000', '%d.%m.%Y').date()
        # Создаем нового администратора с указанными полями
        new_admin = User(
            fio='Администратор',
            birth_date=birth_date,
            mail='admin@example.ru',
            login='admin',
            password=hashed_password,
            id_role=admin_role.id
        )
        # Добавляем нового администратора в сессию и сохраняем изменения
        db.session.add(new_admin)
        db.session.commit()
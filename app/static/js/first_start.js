document.addEventListener('DOMContentLoaded', () => {
    // Значения из атрибутов body
    const firstStart = document.body.getAttribute('data-first-start') === 'True';
    const userId = document.body.getAttribute('data-user-id');
    const userType = document.body.getAttribute('data-user-type'); // 'admin' или 'teacher'

    // Элементы модального окна
    const modal = document.getElementById('passwordModal');
    const closeModal = document.querySelector('.modal .close');
    const savePasswordBtn = document.getElementById('savePasswordBtn');


    // Показ модального окна при первом входе
    if (firstStart) {
        modal.style.display = 'block';
        document.body.classList.add('modal-open');
    }

    // Закрытие модального окна по клику
    closeModal.addEventListener('click', () => {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
    });

    // Переключение видимости пароля
    const togglePasswordButtons = document.querySelectorAll('.toggle-password');
    togglePasswordButtons.forEach(button => {
        button.addEventListener('click', () => {
            const input = button.previousElementSibling;
            if (input && input.tagName === 'INPUT') {
                input.type = input.type === "password" ? "text" : "password";
            }
        });
    });

    // Обработка сохранения нового пароля
    savePasswordBtn.addEventListener('click', async () => {
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (newPassword !== confirmPassword) {
            alert('Пароли не совпадают');
            return;
        }

        // Определение URL в зависимости от типа пользователя
        let url;
        if (userType === 'admin') {
            url = `/auth/admin/api/update_password/${userId}`;
        } else if (userType === 'teacher') {
            url = `/auth/teacher/api/update_password/${userId}`;
        } else {
            alert('Тип пользователя не определён');
            return;
        }

        // Отправка запроса на обновление пароля; JWT-токен будет передан через cookie
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({new_password: newPassword})
        });

        if (response.status === 401) {
            window.location.href = '/auth/login';
            return;
        }

        const data = await response.json();
        if (data.success) {
            alert('Пароль успешно изменён');
            modal.style.display = 'none';
        } else {
            alert('Ошибка: ' + data.message);
        }
        document.body.classList.remove('modal-open');
    });
});

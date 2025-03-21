document.addEventListener('DOMContentLoaded', () => {
    // ============================================
    // Считывание значений из атрибутов body
    // ============================================
    const firstStart = document.body.getAttribute('data-first-start') === 'True';
    const userId = document.body.getAttribute('data-user-id');
    const userType = document.body.getAttribute('data-user-type'); // 'admin' или 'teacher'

    // ============================================
    // Получение ссылок на элементы модального окна
    // ============================================
    const modal = document.getElementById('passwordModal');
    const closeModal = document.querySelector('.modal .close');
    const savePasswordBtn = document.getElementById('savePasswordBtn');

    // ============================================
    // Отображение модального окна, если это первый вход
    // ============================================
    if (firstStart) {
        modal.style.display = 'block';
        document.body.classList.add('modal-open');
    }

    // ============================================
    // Закрытие модального окна по клику на крестик
    // ============================================
    closeModal.addEventListener('click', () => {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
    });

    // ============================================
    // Привязка событий для кнопок "глаз" (переключение видимости пароля)
    // ============================================
    const togglePasswordButtons = document.querySelectorAll('.toggle-password');
    togglePasswordButtons.forEach(button => {
        button.addEventListener('click', () => {
            const input = button.previousElementSibling;
            if (input && input.tagName === 'INPUT') {
                input.type = input.type === "password" ? "text" : "password";
            }
        });
    });

    // ============================================
    // Обработка сохранения нового пароля
    // ============================================
    savePasswordBtn.addEventListener('click', async () => {
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (newPassword !== confirmPassword) {
            alert('Пароли не совпадают');
            return;
        }

        // ============================================
        // Определение URL для обновления пароля в зависимости от типа пользователя
        // ============================================
        let url;
        if (userType === 'admin') {
            url = `/auth/admin/api/update_password/${userId}`;
        } else if (userType === 'teacher') {
            url = `/auth/teacher/api/update_password/${userId}`;
        } else {
            alert('Тип пользователя не определён');
            return;
        }

        // ============================================
        // Отправка запроса на сервер для обновления пароля
        // ============================================
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': document.querySelector('meta[name="csrf-token"]').getAttribute('content')
            },
            body: JSON.stringify({new_password: newPassword})
        });

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

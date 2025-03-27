document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const login = document.getElementById('login').value;
    const password = document.getElementById('password').value;

    try {
        // Отправляем запрос на авторизацию
        const response = await fetch('/auth/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, password }),
            credentials: 'include'  // Указываем, что cookie должны отправляться с запросом
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.msg || 'Ошибка входа');
        }

        // Запрашиваем данные пользователя после успешной авторизации
        const userResponse = await fetch('/auth/api/current_user', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'  // Указываем, что cookie отправляются с запросом
        });

        if (!userResponse.ok) {
            throw new Error('Ошибка получения данных пользователя');
        }

        const userData = await userResponse.json();
        handleUserRedirect(userData.role);

    } catch (error) {
        console.error('Ошибка:', error);
        alert(error.message);
    }
});

// Функция для перенаправления пользователя в зависимости от роли
function handleUserRedirect(role) {
    const routes = {
        'admin': '/auth/admin/hello',
        'teacher': '/auth/teacher/hello'
    };

    window.location.href = routes[role] || '/auth/login';  // Перенаправляем, cookie отправятся автоматически
}